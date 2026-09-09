import { DEFAULT_THEME, type ThemeId, THEME_IDS } from "../types.js";

export class ThemeModel {
  themeId: ThemeId = DEFAULT_THEME;
  threeBackground = false;
  perfLite = false;

  setTheme(id: string): ThemeId {
    if ((THEME_IDS as readonly string[]).includes(id)) {
      this.themeId = id as ThemeId;
    }
    return this.themeId;
  }
}
