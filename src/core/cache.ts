import chalk from "chalk";

export class Cache {
    public videoCache = new Map<string, Buffer>();
    private maxLimit: number;

    constructor(limit: number) {
        this.maxLimit = limit; // Limit of cache
    }

    private cacheGC(id?: string) { // Remove item based on LRU
        if (!(this.videoCache.size >= 1)) return;
        const lastItem = id || this.videoCache.keys().next().value;
        this.videoCache.delete(lastItem!);
        // console.log(chalk.red.italic('Cache delete for id: ', lastItem));
    }

    public save(dirN: string, fileN: string, buffer: Buffer) {
        const id = dirN + fileN;
        // If item already saved then remove from last save at front
        if (this.videoCache.has(id)) {
            this.cacheGC(id);
        }
        // Remove the last item if Cache limit hit
        if (this.videoCache.size >= this.maxLimit) {
            this.cacheGC();
        }
        this.videoCache.set(id, buffer);
        // console.log(chalk.green.italic(`Cache saved for id: ${id}`));
    }

    public get(dirN: string, fileN: string) {
        const id = dirN + fileN;
        console.log(chalk.bgBlue("Saving with file name: ", id));

        const buffer = this.videoCache.get(id);
        if (!buffer) return false;
        this.save(dirN, fileN, buffer!); // Doing this if used recently than remove from back and save in front
        return this.videoCache.get(id) || false;
    }
}

export const cache = new Cache(10); // 10 is Cache Limit;
