import { WebPlugin } from '@capacitor/core';
export class GeolocationWeb extends WebPlugin {
    async getCurrentPosition(options) {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition((pos) => {
                resolve(pos);
            }, (err) => {
                reject(err);
            }, Object.assign({ enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }, options));
        });
    }
    async watchPosition(options, callback) {
        const id = navigator.geolocation.watchPosition((pos) => {
            callback(pos);
        }, (err) => {
            callback(null, err);
        }, Object.assign({ enableHighAccuracy: false, timeout: 10000, maximumAge: 0, minimumUpdateInterval: 5000 }, options));
        return `${id}`;
    }
    async clearWatch(options) {
        navigator.geolocation.clearWatch(parseInt(options.id, 10));
    }
    async checkPermissions() {
        if (typeof navigator === 'undefined' || !navigator.permissions) {
            throw this.unavailable('Permissions API not available in this browser');
        }
        const permission = await navigator.permissions.query({
            name: 'geolocation',
        });
        return { location: permission.state, coarseLocation: permission.state };
    }
    async requestPermissions() {
        throw this.unimplemented('Not implemented on web.');
    }
}
const Geolocation = new GeolocationWeb();
export { Geolocation };
//# sourceMappingURL=web.js.map