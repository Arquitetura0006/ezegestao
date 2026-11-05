/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // That Open Engine referencia THREE.TSL / THREE.NodeMaterial só no modo WebGPU (não usado aqui).
    config.module.rules.push({ test: /[\\/]@thatopen[\\/]/, parser: { exportsPresence: false, url: false } });
    return config;
  },
};

export default nextConfig;
