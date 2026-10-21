import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // proxy가 요청 본문을 버퍼링하는 한도(기본 10MB). 이미지 10MB·PDF 20MB 업로드가 잘리지 않도록 올린다.
  experimental: { proxyClientMaxBodySize: "21mb" },
};

export default nextConfig;
