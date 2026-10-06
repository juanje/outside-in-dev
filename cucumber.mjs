export default {
  paths: ["features/**/*.feature"],
  import: ["features/tsx-register.mjs", "features/steps/**/*.ts", "features/support/**/*.ts"],
  parallel: 4,
};
