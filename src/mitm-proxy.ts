import { Proxy } from "http-mitm-proxy";

const proxy = new Proxy(); // teraz działa!

proxy.onError((ctx, err) => {
    console.error("Proxy error:", err);
});

proxy.onRequest((ctx, callback) => {
    console.log(
        `➡️  [${ctx.clientToProxyRequest.method}] ${ctx.clientToProxyRequest.url}`,
    );

    let body = "";

    ctx.onRequestData((ctx, chunk, cb) => {
        body += chunk.toString();
        return cb(null, chunk);
    });

    ctx.onRequestEnd((ctx, cb) => {
        if (body) {
            console.log("📥 Request body:", body);
        }
        cb();
    });

    ctx.onResponseData((ctx, chunk, cb) => {
        console.log(`⬅️  Response chunk from ${ctx.clientToProxyRequest.url}`);
        cb(null, chunk);
    });

    callback();
});

proxy.listen({ host: '0.0.0.0', port: 8080 }, () => {
    console.log("🛡️  MITM Proxy listening on port 8080");
});
