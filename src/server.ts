import { Proxy } from "http-mitm-proxy";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { Buffer } from "buffer";

const proxy = new Proxy();
let counter = 0;

proxy.onResponse((ctx, callback) => {
    const chunks: Buffer[] = [];

    ctx.onResponseData((ctx, chunk, done) => {
        chunks.push(chunk);
        done(null, null);
    });

    ctx.onResponseEnd((ctx, done) => {
        const rawBuffer = Buffer.concat(chunks);
        const encoding = ctx.serverToProxyResponse.headers["content-encoding"];
        const contentType =
            ctx.serverToProxyResponse.headers["content-type"] || "";
        const url = ctx.clientToProxyRequest.url || "";
        const method = ctx.clientToProxyRequest.method || "GET";
        const host = ctx.clientToProxyRequest.headers?.host || "unknown";

        decompressBody(rawBuffer, encoding)
            .then(bodyBuffer => {
                const bodyText = bodyBuffer.toString("utf8");
                let filename: string;
                let contentToSave: string;

                const isJson =
                    contentType.includes("application/json") ||
                    looksLikeJson(bodyText);

                if (isJson) {
                    try {
                        const parsed = JSON.parse(bodyText);
                        contentToSave = JSON.stringify(parsed, null, 2);
                        filename = `${++counter}_${method}_${sanitizeFilename(
                            host + url,
                        )}.json`;
                    } catch {
                        // JSON.parse się nie udał, zapisujemy jako tekst
                        contentToSave = bodyText;
                        filename = `${++counter}_${method}_${sanitizeFilename(
                            host + url,
                        )}.txt`;
                    }
                } else {
                    contentToSave = bodyText;
                    filename = `${++counter}_${method}_${sanitizeFilename(
                        host + url,
                    )}.txt`;
                }

                const filePath = path.join(__dirname, "logs", filename);
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, contentToSave, "utf8");
                console.log(`📁 Zapisano do: ${filename}`);

                ctx.proxyToClientResponse.write(rawBuffer);
                ctx.proxyToClientResponse.end();
                done();
            })
            .catch(err => {
                console.error("❌ Błąd dekodowania:", err);
                ctx.proxyToClientResponse.write(rawBuffer);
                ctx.proxyToClientResponse.end();
                done();
            });
    });

    callback();
});

proxy.listen({ port: 8080, host: "0.0.0.0" }, () => {
    console.log("🌐 Proxy działa na http://0.0.0.0:8080");
});

function sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").substring(0, 200);
}

function decompressBody(buffer: Buffer, encoding?: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        if (!encoding || encoding === "identity") return resolve(buffer);

        switch (encoding.toLowerCase()) {
            case "gzip":
                zlib.gunzip(buffer, cb(resolve, reject));
                break;
            case "deflate":
                zlib.inflate(buffer, cb(resolve, reject));
                break;
            case "br":
                zlib.brotliDecompress(buffer, cb(resolve, reject));
                break;
            default:
                reject(new Error(`Nieznane kodowanie:  + ${encoding}`));
        }
    });
}

function cb(resolve: (b: Buffer) => void, reject: (e: Error) => void) {
    return (err: Error | null, result: Buffer) => {
        if (err) reject(err);
        else resolve(result);
    };
}

function looksLikeJson(text: string): boolean {
    return text.trim().startsWith("{") || text.trim().startsWith("[");
}
