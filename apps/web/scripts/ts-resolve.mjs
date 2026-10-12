/* Lets the model build script import app TypeScript modules that use extensionless relative
   imports (as Vite does). Node's own type stripping handles the .ts syntax. */
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); } catch (error) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
