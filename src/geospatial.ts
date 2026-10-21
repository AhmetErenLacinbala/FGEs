export function degreesToRadians(theta: number): number {
    return theta * Math.PI / 180;
}

/** @deprecated Use degreesToRadians. */
export const Deg2Rad = degreesToRadians;

/** WGS84 reference ellipsoid constants. */
export const WGS84 = {
    a: 6378137.0,              // equator diameter (metre)
    b: 6356752.314245,         // polat diameter (meter)
    f: 1 / 298.257223563,      // flattening
    e2: 0.00669437999014,      // first eccentricity squared (e²)
    e_prime2: 0.00673949674228 // second eccentricity squared (e'²)
};




//coordinate Transforms
export interface GeodeticCoord {
    latitude: number;
    longitude: number;
    height: number;
}

export interface CartesianCoord {
    x: number;
    y: number;
    z: number;
}

export function geodeticToECEF(geo: GeodeticCoord): CartesianCoord {
    // Dereceyi radyana çevir
    const latRad = geo.latitude * Math.PI / 180;
    const lonRad = geo.longitude * Math.PI / 180;

    // Sinüs ve kosinüs değerleri
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);

    // N: Meridyen eğrilik yarıçapı (prime vertical radius of curvature)
    // Bu değer enlem'e bağlı olarak değişir - elipsoid için kritik!
    const N = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);

    // ECEF koordinatları
    const x = (N + geo.height) * cosLat * cosLon;
    const y = (N + geo.height) * cosLat * sinLon;
    const z = (N * (1 - WGS84.e2) + geo.height) * sinLat;

    return { x, y, z };
}

export function ecefToGeodetic(cart: CartesianCoord): GeodeticCoord {
    const { x, y, z } = cart;

    // Boylam doğrudan hesaplanabilir
    const longitude = Math.atan2(y, x) * 180 / Math.PI;

    // p: XY düzlemindeki uzaklık
    const p = Math.sqrt(x * x + y * y);

    // İlk tahmin (Bowring başlangıç değeri)
    let lat = Math.atan2(z, p * (1 - WGS84.e2));

    // İteratif çözüm (genellikle 2-3 iterasyon yeterli)
    for (let i = 0; i < 10; i++) {
        const sinLat = Math.sin(lat);
        const N = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
        const latNew = Math.atan2(
            z + WGS84.e2 * N * sinLat,
            p
        );

        // convergence check (1e-12 radian ≈ 0.006mm precision)
        if (Math.abs(latNew - lat) < 1e-12) {
            lat = latNew;
            break;
        }
        lat = latNew;
    }

    // height calculation
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const N = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
    const altitude = p / cosLat - N;

    return {
        latitude: lat * 180 / Math.PI,
        longitude: longitude,
        height: altitude
    };
}

// Earth model sabitleri
export const EARTH_MODEL = {
    RADIUS: 6378137,           // WGS84 ekvatoral yarıçap (metre)
    MODEL_RADIUS: 500,         // Blender model yarıçapı (metre)
    MODEL_SCALE: 0.01,         // Sahnedeki scale faktörü
};

/** Terrain heightmap yükseklik abartması (MeshFactory.fromHeightmapGeodetic ile aynı) */
export const EARTH_HEIGHT_EXAGGERATION = 100;

/**
 * Marker koordinatını geoid tile dünyasındaki sahne pozisyonuna çevirir.
 * Yüzeyden hafifçe dışarı offset uygular (billboard görünürlüğü için).
 */
export function geodeticMarkerToSceneCoord(
    latitude: number,
    longitude: number,
    height: number = 0,
    surfaceOffset: number = 0.05
): CartesianCoord {
    const p = geodeticToSceneCoord(latitude, longitude, height * EARTH_HEIGHT_EXAGGERATION);
    const len = Math.hypot(p.x, p.y, p.z) || 1;
    const scale = (len + surfaceOffset) / len;
    return { x: p.x * scale, y: p.y * scale, z: p.z * scale };
}

/**
 * Geodetik koordinatları (lat/lon/height) sahne koordinatlarına çevirir
 * Dünya modeli için kullanılır
 */
export function geodeticToSceneCoord(
    latitude: number,
    longitude: number,
    height: number = 0
): CartesianCoord {
    // ECEF koordinatlarını hesapla
    const ecef = geodeticToECEF({ latitude, longitude, height });

    // Model ölçeğine normalize et
    const scaleFactor = (EARTH_MODEL.MODEL_RADIUS * EARTH_MODEL.MODEL_SCALE) / EARTH_MODEL.RADIUS;

    return {
        x: ecef.x * scaleFactor,
        y: ecef.y * scaleFactor,
        z: ecef.z * scaleFactor
    };
}

/**
 * Sahne koordinatlarını geodetik koordinatlara çevirir
 */
export function sceneCoordToGeodetic(
    x: number,
    y: number,
    z: number
): GeodeticCoord {
    // Ölçeği geri al
    const scaleFactor = EARTH_MODEL.RADIUS / (EARTH_MODEL.MODEL_RADIUS * EARTH_MODEL.MODEL_SCALE);

    const ecef: CartesianCoord = {
        x: x * scaleFactor,
        y: y * scaleFactor,
        z: z * scaleFactor
    };

    return ecefToGeodetic(ecef);
}
