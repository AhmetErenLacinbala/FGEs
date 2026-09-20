export interface MarkerData {
    latitude: number;
    longitude: number;
    height: number;
    color: [number, number, number, number];
    label: string;
}

export const MARKERS: MarkerData[] = [
    {
        latitude: 41.0082,
        longitude: 28.9784,
        height: 0,
        color: [1, 1, 0, 1],
        label: "Istanbul",
    },
];
