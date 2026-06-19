import { t } from "../lib/i18n";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../components/ui/Icon";
import { trackEvent } from "../lib/observability";
const teasers = [
  t('len_lich_trinh_cong_dong'),
  t('goi_y_dia_diem_hop'),
  t('tu_xep_anh_theo_hanh'),
];

export function AIPlanPage() {
  const { t } = useTranslation();
  useEffect(() => {
    trackEvent("ai_plan_open");
  }, []);

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-green-700 text-white shadow-card">
        <Icon name="bot" size={40} />
      </span>
      <div>
        <h2 className="font-display text-2xl font-bold text-clay-600">{t('tro_ly_ai')}</h2>
        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
          <Icon name="sparkles" size={14} /> {t('sap_ra_mat')}
        </p>
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">
        {t('tinh_nang_lap_ke_hoach')}
      </p>
      <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
        {teasers.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <Icon name="sparkles" size={14} className="text-green-600" /> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
