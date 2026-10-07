// Strip the wrapper Maya puts around every commandPort reply: quoted, with a
// trailing newline and a NUL terminator. `trim()` alone is not enough because
// NUL is not whitespace, so `"None\u0000"` would leak into the UI.
export function cleanResponse(response: string): string {
    return response
        .replace(/['"]/g, '')
        .replace(/[\r\n\0]/g, '')
        .trim();
}
