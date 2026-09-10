/**
 * ==========================================================
 * RESPONSE HELPER
 * ==========================================================
 *
 * Standard JSON response helper used by all controllers.
 */

function jsonResponse_(success, message, data) {

  return ContentService
    .createTextOutput(
      JSON.stringify({
        success: success,
        message: message,
        data: data || null
      })
    )
    .setMimeType(ContentService.MimeType.JSON);

}