/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/",
        destination: "/plans",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
