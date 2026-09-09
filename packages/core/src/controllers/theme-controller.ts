import type { ThemeModel } from "../models/theme-model.js";
import type { ThemeId } from "../types.js";

export class ThemeController {
  constructor(private model: ThemeModel) {}

  setTheme(id: string): ThemeId {
    return this.model.setTheme(id);
  }

  setThreeBackground(on: boolean) {
    this.model.threeBackground = on;
  }

  setPerfLite(on: boolean) {
    this.model.perfLite = on;
  }
}
