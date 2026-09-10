/**
 * Converts a sheet into an array of JavaScript objects.
 * Row 1 = headers.
 * Row 2 onwards = data.
 *
 * Example:
 * [
 *   { "Maintenance ID":"MNT-0001", "Status":"Open" },
 *   { "Maintenance ID":"MNT-0002", "Status":"Completed" }
 * ]
 */
function sheetToObjects_(sheet) {

  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];

  return values.slice(1).map(function(row) {

    const obj = {};

    headers.forEach(function(header, i) {
      obj[String(header).trim()] = row[i];
    });

    return obj;

  });

}