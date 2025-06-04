const fs = require("fs");
const path = require("path");
const request = require("request");
const headers = require("./utils/headers");
const { URL } = require("./config/config");

/**
 * Get the map by latitude and longitude of four corners
 *
 * @param {Number} north Latitude for Northwest
 * @param {Number} west Longitude for Northwest
 * @param {Number} south Latitude for Sourtheast
 * @param {Number} east Longitude for Sourtheast
 * @param {Number} zoom Zoom
 * @param {String} output output filename
 * @param {String} maptype type
 */
const procesLatlng = function(
  north,
  west,
  south,
  east,
  zoom,
  output,
  maptype,
  suffix
) {
  output = output || "mosaic";
  maptype = maptype || "default";
  var left_top = latlng2tilenum(north, west, zoom);
  var right_bottom = latlng2tilenum(south, east, zoom);
  processTilenum(
    left_top[0],
    right_bottom[0],
    left_top[1],
    right_bottom[1],
    zoom,
    output,
    maptype,
    suffix
  );
};

/**
 * Get the map by x-axis and y axis of four corners
 *
 * @param {Number} left x-axis for Northwest
 * @param {Number} right y-axis for Northwest
 * @param {Number} top x-axis for Sourtheast
 * @param {Number} bottom y-axis for Northeast
 * @param {Number} zoom Zoom
 * @param {String} output output filename
 * @param {String} maptype type
 */
const processTilenum = function(
  left,
  right,
  top,
  bottom,
  zoom,
  output,
  maptype,
  suffix
) {
  output = output || "mosaic";
  maptype = maptype || "default";
  checkout(left, right, top, bottom, zoom, output, maptype, suffix);
};

/**
 * Descarga una imagen y devuelve una Promesa.
 * @param {Number} x
 * @param {Number} y
 * @param {Number} z
 * @param {String} filename
 * @param {String} maptype
 * @returns {Promise<void>}
 */
const _download = function(x, y, z, filename, maptype) {
  return new Promise((resolve, reject) => {
    const url = URL[maptype].format({ x: x, y: y, z: z, s: random(1, 4) });
    const pathname = path.dirname(filename);
    mkdirsSync(pathname);

    if (fs.existsSync(filename)) {
      // Si el archivo ya existe, resolvemos inmediatamente.
      // Opcionalmente, podrías verificar si el archivo está completo/corrupto.
      resolve();
      return;
    }

    request(
      {
        url: url,
        headers: headers,
        encoding: "binary",
      },
      (err, response) => {
        if (err) {
          console.error(`Error descargando ${url}:`, err);
          return reject(err);
        }
        if (response.statusCode !== 200) {
            console.error(`Error en la respuesta para ${url}: Estado ${response.statusCode}`);
            return reject(new Error(`Estado HTTP inesperado: ${response.statusCode}`));
        }
        fs.writeFileSync(filename, response.body, "binary");
        console.log(`Descargado: ${filename}`);
        resolve();
      }
    );
  });
};

const latlng2tilenum = function(lat_deg, lng_deg, zoom) {
  var n = Math.pow(2, zoom);
  var xtile = ((lng_deg + 180) / 360) * n;
  var lat_rad = (lat_deg / 180) * Math.PI;
  var ytile =
    ((1 - Math.log(Math.tan(lat_rad) + 1 / Math.cos(lat_rad)) / Math.PI) / 2) *
    n;
  // Cuando el rango es para un mosaico global;
  if (xtile < 0) xtile = 0;
  if (xtile >= 1 << zoom) xtile = (1 << zoom) - 1;
  if (ytile < 0) ytile = 0;
  if (ytile >= 1 << zoom) ytile = (1 << zoom) - 1;
  return [Math.floor(xtile), Math.floor(ytile)];
};

const random = function(start, end) {
  return Math.floor(Math.random() * (end - start + 1)) + start;
};

/**
 * Función de retardo asíncrona.
 * @param {number} ms El tiempo en milisegundos para retrasar.
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkout = async function( // Añadimos 'async' aquí
  left,
  right,
  top,
  bottom,
  z,
  filename,
  maptype,
  suffix
) {
  maptype = maptype || "default";
  const downloadPromises = [];

  for (let x = left; x < right + 1; x++) {
    for (let y = top; y < bottom + 1; y++) {
      const pathname = `tiles/{filename}/{z}/{x}/{y}.${suffix}`.format({
        x: x,
        y: y,
        z: z,
        filename: filename,
      });
      const abspath = path.resolve(pathname);

      // Creamos una función que devuelve una promesa para cada descarga
      const downloadTask = async () => {
        if (!fs.existsSync(abspath)) {
          await _download(x, y, z, pathname, maptype);
        } else {
          // Si el archivo existe, verificamos su tamaño
          // Si es 0, lo borramos y lo descargamos de nuevo
          try {
            const stats = fs.statSync(abspath); // Usamos statSync para simplicidad aquí, o puedes refactorizar con async fs.promises.stat
            if (stats.size === 0) {
              fs.unlinkSync(abspath);
              console.log(`Eliminado archivo vacío: ${abspath}`);
              await _download(x, y, z, pathname, maptype);
            } else {
                console.log(`Saltando existente: ${abspath}`);
            }
          } catch (err) {
            console.error(`Error al verificar o eliminar el archivo ${abspath}:`, err);
            await _download(x, y, z, pathname, maptype); // Intentar descargar si hay error al stat
          }
        }
      };
      downloadPromises.push(downloadTask);
    }
  }

  // Iterar sobre las promesas de descarga y añadir el delay
  for (const task of downloadPromises) {
    try {
      await task(); // Espera a que la descarga se complete
      await delay(500); // Espera 500ms antes de la siguiente descarga
    } catch (error) {
      console.error("Error durante la descarga de una imagen:", error);
      // Aquí puedes decidir si quieres continuar con la siguiente imagen o abortar
    }
  }
  console.log("Todas las descargas han sido procesadas.");
};


// Las siguientes funciones no necesitan cambios
String.prototype.format = function(json) {
  var temp = this;
  for (var key in json) {
    temp = temp.replace("{" + key + "}", json[key]);
  }
  return temp;
};

Number.prototype.toRad = function() {
  return (this * Math.PI) / 180;
};

const mkdirsSync = function(dirpath, mode) {
  if (!fs.existsSync(dirpath)) {
    var pathtmp;
    dirpath.split("/").forEach(function(dirname) {
      if (pathtmp) {
        pathtmp = path.join(pathtmp, dirname);
      } else {
        pathtmp = dirname;
      }
      if (!fs.existsSync(pathtmp)) {
        if (!fs.mkdirSync(pathtmp, mode)) {
          return false;
        }
      }
    });
  }
  return true;
};

module.exports = {
  procesLatlng,
  processTilenum,
};
