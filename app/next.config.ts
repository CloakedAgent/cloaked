import type { NextConfig } from "next";
import path from "path";
import createMDX from "@next/mdx";
import rehypePrism from "rehype-prism-plus";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";

const nextConfig: NextConfig = {
  // Enable MDX pages
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  // Standalone output for Docker deployment
  output: "standalone",

  // Transpile Privacy Cash SDK
  transpilePackages: ["privacycash", "@lightprotocol/hasher.rs"],

  // COOP/COEP headers for SharedArrayBuffer (required for bb.js multi-threading)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob:",
              "font-src 'self' data: https://fonts.gstatic.com",
              `connect-src 'self' data: https://api.cloakedagent.com https://api.devnet.solana.com wss://api.devnet.solana.com wss://api.cloakedagent.com${process.env.NODE_ENV === "development" ? " http://localhost:3645 ws://localhost:3645" : ""}`,
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    // Enable WASM support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Resolve WASM files from hasher.rs package
    config.resolve.alias = {
      ...config.resolve.alias,
      "light_wasm_hasher_bg.wasm": path.resolve(
        __dirname,
        "node_modules/@lightprotocol/hasher.rs/dist/light_wasm_hasher_bg.wasm"
      ),
      "hasher_wasm_simd_bg.wasm": path.resolve(
        __dirname,
        "node_modules/@lightprotocol/hasher.rs/dist/hasher_wasm_simd_bg.wasm"
      ),
    };

    // Handle WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
      generator: {
        filename: "static/wasm/[hash][ext]",
      },
    });

    // Configure fallbacks for browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        worker_threads: false,
      };

      // Force bb.js to use browser build (not node-cjs which requires worker_threads)
      // bb.js is in the SDK's node_modules, not the app's
      config.resolve.alias = {
        ...config.resolve.alias,
        "@aztec/bb.js": path.resolve(
          __dirname,
          "../sdk/node_modules/@aztec/bb.js/dest/browser/index.js"
        ),
      };
    }

    // Suppress "Critical dependency" warnings from ZK libraries
    config.ignoreWarnings = [
      {
        module: /node_modules\/web-worker/,
        message: /Critical dependency/,
      },
      {
        module: /node_modules\/ffjavascript/,
        message: /Critical dependency/,
      },
    ];

    return config;
  },
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkFrontmatter, remarkGfm],
    rehypePlugins: [rehypeSlug, [rehypePrism, { ignoreMissing: true }]],
  },
});

export default withMDX(nextConfig);
