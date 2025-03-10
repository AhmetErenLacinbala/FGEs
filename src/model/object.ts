export default class GameObject {
    private static idCounter: number = 0;
    public readonly id: number;
    constructor() {
        this.id = GameObject.idCounter++;
    }
}