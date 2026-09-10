/**
 * Re-export the canonical GeneratorLogService from the API layer.
 * Module components keep importing from here — mirrors facilities pattern.
 */
export {
  GeneratorLogService,
  type IGeneratorLogService,
} from "@/services/generatorLog/GeneratorLogService";
