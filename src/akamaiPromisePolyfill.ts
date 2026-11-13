/**
 * @monetizationos/proxy reads page metadata with Promise.withResolvers (ES2024). EdgeWorkers doesn't
 * publish its V8 version, so install it when missing.
 */
export function installPromisePolyfill(): void {
    if (typeof Promise.withResolvers === 'function') {
        return
    }
    Promise.withResolvers = <T>(): PromiseWithResolvers<T> => {
        let resolve!: PromiseWithResolvers<T>['resolve']
        let reject!: PromiseWithResolvers<T>['reject']
        const promise = new Promise<T>((res, rej) => {
            resolve = res
            reject = rej
        })
        return { promise, resolve, reject }
    }
}
