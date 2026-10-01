import { memo } from "react";
import { RangeSetting, SectionLabel } from "./controls";
import type { FontScale, Translator } from "./deps";
import { sliderPct } from "./styles";

interface DisplaySectionProps {
  s: FontScale;
  t: Translator;
  appBlur: number;
  onAppBlurChange: (value: number) => void;
  appOpacity: number;
  onAppOpacityChange: (value: number) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
}

/** Window blur / opacity and the TYPOGRAPHY font-size slider. */
export const DisplaySection = memo(function DisplaySection({
  s,
  t,
  appBlur,
  onAppBlurChange,
  appOpacity,
  onAppOpacityChange,
  fontSize,
  onFontSizeChange,
}: DisplaySectionProps) {
  const blur = appBlur || 0;
  return (
    <>
      <RangeSetting
        s={s}
        label={t("settings.appBlurValue", { value: blur })}
        value={blur}
        min={0}
        max={20}
        pct={sliderPct(blur, 0, 20)}
        onValueChange={onAppBlurChange}
        description={t("settings.appBlurDescription")}
      />
      <RangeSetting
        s={s}
        label={t("settings.appOpacityValue", { value: appOpacity })}
        value={appOpacity}
        min={30}
        max={100}
        pct={sliderPct(appOpacity || 100, 30, 100)}
        onValueChange={onAppOpacityChange}
        description={t("settings.appOpacityDescription")}
      />

      <SectionLabel s={s}>{t("settings.typography")}</SectionLabel>
      <RangeSetting
        s={s}
        label={t("settings.fontSizeValue", { value: fontSize })}
        value={fontSize}
        min={12}
        max={22}
        pct={sliderPct(fontSize, 12, 22)}
        onValueChange={onFontSizeChange}
      />
    </>
  );
});
