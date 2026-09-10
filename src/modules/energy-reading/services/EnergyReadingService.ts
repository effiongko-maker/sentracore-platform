/**
 * Re-export the canonical EnergyReadingService from the API layer.
 * Module components keep importing from here — mirrors generator-log pattern.
 */
export {
  EnergyReadingService,
  type IEnergyReadingService,
} from "@/services/energyReading/EnergyReadingService";
