import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs'; // <-- Add this

export default {
  input: 'src/main.ts',
  output: {
    dir: '.',
    format: 'cjs',
    sourcemap: true,
  },
  external: ['obsidian'],
  plugins: [
    nodeResolve(),
    commonjs(), // <-- Add this
    typescript({
      tsconfig: 'tsconfig.json',
      useTsconfigDeclarationDir: true,
    }),
  ],
};
