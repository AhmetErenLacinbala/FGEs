/**
 * TKGM (Tapu ve Kadastro Genel Müdürlüğü) API Service
 * Türk ada parsel sistemi için API entegrasyonu
 */

// Şehir verileri (TKGM'den alınan sabit değerler)
export interface City {
    id: number;
    name: string;
}

export interface District {
    id: number;
    name: string;
    coordinates?: number[][][];
}

export interface Neighborhood {
    id: number;
    name: string;
    coordinates?: number[][][];
}

export interface ParcelResult {
    type: string;
    geometry: {
        type: string;
        coordinates: number[][][];
    };
    properties: {
        ilceAd: string;
        mevkii: string;
        ilId: number;
        durum: string;
        ilceId: number;
        zeminKmdurum: string;
        parselNo: string;
        mahalleAd: string;
        ozet: string;
        gittigiParselListe: string;
        gittigiParselSebep: string;
        alan: string;
        adaNo: string;
        nitelik: string;
        ilAd: string;
        mahalleId: number;
        pafta: string;
    };
}

// Sabit şehir listesi
export const CITIES: City[] = [
    { id: 23, name: "Adana" },
    { id: 24, name: "Adıyaman" },
    { id: 25, name: "Afyonkarahisar" },
    { id: 26, name: "Ağrı" },
    { id: 90, name: "Aksaray" },
    { id: 27, name: "Amasya" },
    { id: 28, name: "Ankara" },
    { id: 29, name: "Antalya" },
    { id: 97, name: "Ardahan" },
    { id: 30, name: "Artvin" },
    { id: 31, name: "Aydın" },
    { id: 32, name: "Balıkesir" },
    { id: 96, name: "Bartın" },
    { id: 94, name: "Batman" },
    { id: 91, name: "Bayburt" },
    { id: 33, name: "Bilecik" },
    { id: 34, name: "Bingöl" },
    { id: 35, name: "Bitlis" },
    { id: 36, name: "Bolu" },
    { id: 37, name: "Burdur" },
    { id: 38, name: "Bursa" },
    { id: 39, name: "Çanakkale" },
    { id: 40, name: "Çankırı" },
    { id: 41, name: "Çorum" },
    { id: 42, name: "Denizli" },
    { id: 43, name: "Diyarbakır" },
    { id: 103, name: "Düzce" },
    { id: 44, name: "Edirne" },
    { id: 45, name: "Elazığ" },
    { id: 46, name: "Erzincan" },
    { id: 47, name: "Erzurum" },
    { id: 48, name: "Eskişehir" },
    { id: 49, name: "Gaziantep" },
    { id: 50, name: "Giresun" },
    { id: 51, name: "Gümüşhane" },
    { id: 52, name: "Hakkari" },
    { id: 53, name: "Hatay" },
    { id: 98, name: "Iğdır" },
    { id: 54, name: "Isparta" },
    { id: 56, name: "İstanbul" },
    { id: 57, name: "İzmir" },
    { id: 68, name: "Kahramanmaraş" },
    { id: 100, name: "Karabük" },
    { id: 92, name: "Karaman" },
    { id: 58, name: "Kars" },
    { id: 59, name: "Kastamonu" },
    { id: 60, name: "Kayseri" },
    { id: 101, name: "Kilis" },
    { id: 93, name: "Kırıkkale" },
    { id: 61, name: "Kırklareli" },
    { id: 62, name: "Kırşehir" },
    { id: 63, name: "Kocaeli" },
    { id: 64, name: "Konya" },
    { id: 65, name: "Kütahya" },
    { id: 66, name: "Malatya" },
    { id: 67, name: "Manisa" },
    { id: 69, name: "Mardin" },
    { id: 55, name: "Mersin" },
    { id: 70, name: "Muğla" },
    { id: 71, name: "Muş" },
    { id: 72, name: "Nevşehir" },
    { id: 73, name: "Niğde" },
    { id: 74, name: "Ordu" },
    { id: 102, name: "Osmaniye" },
    { id: 75, name: "Rize" },
    { id: 76, name: "Sakarya" },
    { id: 77, name: "Samsun" },
    { id: 85, name: "Şanlıurfa" },
    { id: 78, name: "Siirt" },
    { id: 79, name: "Sinop" },
    { id: 95, name: "Şırnak" },
    { id: 80, name: "Sivas" },
    { id: 81, name: "Tekirdağ" },
    { id: 82, name: "Tokat" },
    { id: 83, name: "Trabzon" },
    { id: 84, name: "Tunceli" },
    { id: 86, name: "Uşak" },
    { id: 87, name: "Van" },
    { id: 99, name: "Yalova" },
    { id: 88, name: "Yozgat" },
    { id: 89, name: "Zonguldak" }
];

class TKGMService {
    // Use proxy URL to bypass CORS in development
    // Vite proxies /tkgm-api/* to https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/*
    private readonly baseUrl = '/tkgm-api';

    /**
     * Şehirlerin listesini döndür (sabit)
     */
    getCities(): City[] {
        return CITIES;
    }

    /**
     * Seçilen şehrin ilçelerini getir
     */
    async getDistricts(cityId: number): Promise<District[]> {
        try {
            console.log(`🏛️ TKGM: Fetching districts for city ${cityId}...`);
            const response = await fetch(`${this.baseUrl}/idariYapi/ilceListe/${cityId}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            const districts: District[] = data.features.map((feature: any) => ({
                id: feature.properties.id,
                name: feature.properties.text,
                coordinates: feature.geometry?.coordinates
            }));

            console.log(`✅ TKGM: Found ${districts.length} districts`);
            return districts.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        } catch (error) {
            console.error('❌ TKGM: Failed to fetch districts:', error);
            throw error;
        }
    }

    /**
     * Seçilen ilçenin mahallelerini getir
     */
    async getNeighborhoods(districtId: number): Promise<Neighborhood[]> {
        try {
            console.log(`🏘️ TKGM: Fetching neighborhoods for district ${districtId}...`);
            const response = await fetch(`${this.baseUrl}/idariYapi/mahalleListe/${districtId}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            const neighborhoods: Neighborhood[] = data.features.map((feature: any) => ({
                id: feature.properties.id,
                name: feature.properties.text,
                coordinates: feature.geometry?.coordinates
            }));

            console.log(`✅ TKGM: Found ${neighborhoods.length} neighborhoods`);
            return neighborhoods.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        } catch (error) {
            console.error('❌ TKGM: Failed to fetch neighborhoods:', error);
            throw error;
        }
    }

    /**
     * Parsel bilgilerini getir
     * @param neighborhoodId Mahalle ID
     * @param blockNo Ada numarası (opsiyonel, 0 = yok)
     * @param parcelNo Parsel numarası
     */
    async getParcel(neighborhoodId: number, blockNo: string, parcelNo: string): Promise<ParcelResult | null> {
        try {
            // Ada yoksa 0 kullan
            const block = blockNo.trim() || '0';

            console.log(`📍 TKGM: Fetching parcel ${neighborhoodId}/${block}/${parcelNo}...`);
            const response = await fetch(`${this.baseUrl}/parsel/${neighborhoodId}/${block}/${parcelNo}`);

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('⚠️ TKGM: Parcel not found');
                    return null;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            console.log('✅ TKGM: Parcel found:', data);
            return data as ParcelResult;
        } catch (error) {
            console.error('❌ TKGM: Failed to fetch parcel:', error);
            throw error;
        }
    }
}

export const tkgmService = new TKGMService();
export default tkgmService;
