/**
 * Parsing helpers for commandPort replies.
 */

/**
 * Strip the wrapper Maya puts around every commandPort reply.
 *
 * Responses arrive as `"/path/scene.ma\n\u0000"` — quoted, with a trailing
 * newline and a NUL terminator. `trim()` alone is not enough because NUL is
 * not whitespace, so `"None\u0000"` would fail an equality check against
 * "None" and leak into the UI.
 */
export function cleanResponse(response: string): string {
    return response
        .replace(/['"]/g, '')
        .replace(/[\r\n\0]/g, '')
        .trim();
}