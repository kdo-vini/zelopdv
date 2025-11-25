/**
 * Wraps a promise with a timeout.
 * @param {Promise} promise - The promise to wrap.
 * @param {number} ms - Timeout in milliseconds (default 10000ms).
 * @param {string} errorMsg - Custom error message.
 * @returns {Promise}
 */
export async function withTimeout(promise, ms = 10000, errorMsg = 'A solicitação excedeu o tempo limite.') {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        return result;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Helper to run multiple async operations in parallel and return results.
 * Throws if any operation fails.
 * @param {Array<Promise>} promises 
 * @returns {Promise<Array>}
 */
export async function fetchAll(promises) {
    return Promise.all(promises);
}
