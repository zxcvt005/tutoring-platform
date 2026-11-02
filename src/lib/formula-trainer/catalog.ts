import type {
  FormulaCard,
  FormulaSectionId,
  FormulaSubsectionId,
  TrainerGroupId,
} from "./types";

type Draft = {
  id: string;
  sectionId: FormulaSectionId;
  subsectionId: FormulaSubsectionId;
  title: string;
  expression: string;
  targetQuantity?: string | null;
  acceptedForms?: string[];
  distractorTemplates?: string[];
  symbolicCheck?: boolean;
  notes?: string;
};

const SECTION_TITLES: Record<FormulaSectionId, string> = {
  mechanics: "Механика",
  molecular: "Молекулярная физика",
  thermodynamics: "Термодинамика",
  electrostatics: "Электростатика и конденсаторы",
  current: "Постоянный ток",
  magnetism: "Магнетизм и электромагнетизм",
  optics: "Оптика",
  quantum: "Квантовая физика",
};

const SUBSECTION_TITLES: Record<FormulaSubsectionId, string> = {
  kinematics: "Кинематика",
  rotation: "Вращательное движение",
  dynamics: "Динамика",
  statics: "Статика",
  conservation: "Законы сохранения",
  oscillations: "Колебания и волны",
  mkt: "МКТ",
  internal_energy: "Внутренняя энергия",
  humidity: "Влажность",
  heat: "Количество теплоты",
  thermo: "Термодинамика",
  electrostatics: "Электростатика",
  capacitors: "Конденсаторы",
  dc: "Постоянный ток",
  series_parallel: "Последовательное и параллельное соединение",
  joule: "Закон Джоуля — Ленца, теплота и мощность",
  magnetism: "Магнетизм",
  induction: "Электромагнитная индукция",
  inductance: "Индуктивность и самоиндукция",
  em_oscillations: "Электромагнитные колебания",
  thin_lens: "Тонкая линза",
  refraction_diffraction: "Преломление и дифракция",
  photon: "Энергия и импульс фотона",
  photoeffect: "Фотоэффект",
  radioactive: "Радиоактивный распад",
};

function card(d: Draft): FormulaCard {
  const lhs = d.expression.split("=")[0]?.trim() ?? null;
  return {
    id: d.id,
    sectionId: d.sectionId,
    subsectionId: d.subsectionId,
    sectionTitle: SECTION_TITLES[d.sectionId],
    subsectionTitle: SUBSECTION_TITLES[d.subsectionId],
    title: d.title,
    expression: d.expression,
    targetQuantity: d.targetQuantity === undefined ? lhs : d.targetQuantity,
    acceptedForms: d.acceptedForms ?? [],
    distractorTemplates: d.distractorTemplates ?? [],
    symbolicCheck: d.symbolicCheck ?? true,
    notes: d.notes,
  };
}

const DRAFTS: Draft[] = [
  // 8.1 Кинематика
  {
    id: "mech_kin_s_vt",
    sectionId: "mechanics",
    subsectionId: "kinematics",
    title: "Путь при равномерном движении",
    expression: "s = v*t",
    distractorTemplates: ["s = v/t", "s = v+t", "s = v*t^2", "s = a*t"],
  },
  {
    id: "mech_kin_v_st",
    sectionId: "mechanics",
    subsectionId: "kinematics",
    title: "Скорость при равномерном движении",
    expression: "v = s/t",
    distractorTemplates: ["v = s*t", "v = t/s", "v = s+t", "v = a*t"],
  },
  {
    id: "mech_kin_x_uniform",
    sectionId: "mechanics",
    subsectionId: "kinematics",
    title: "Координата при равномерном движении",
    expression: "x = x0 + v*t",
    distractorTemplates: [
      "x = x0 - v*t",
      "x = x0 + v/t",
      "x = x0 + a*t",
      "x = v*t",
    ],
  },
  {
    id: "mech_kin_a_def",
    sectionId: "mechanics",
    subsectionId: "kinematics",
    title: "Ускорение",
    expression: "a = (v - v0)/t",
    distractorTemplates: [
      "a = (v + v0)/t",
      "a = (v - v0)*t",
      "a = v/t",
      "a = (v0 - v)/t",
    ],
  },
  {
    id: "mech_kin_s_accel",
    sectionId: "mechanics",
    subsectionId: "kinematics",
    title: "Путь при равноускоренном движении",
    expression: "s = v0*t + a*t^2/2",
    acceptedForms: ["s = v0*t + (a*t^2)/2"],
    distractorTemplates: [
      "s = v0*t + a*t^2",
      "s = v0*t - a*t^2/2",
      "s = v*t + a*t^2/2",
      "s = v0*t^2 + a*t/2",
    ],
  },
  {
    id: "mech_kin_x_accel",
    sectionId: "mechanics",
    subsectionId: "kinematics",
    title: "Координата при равноускоренном движении",
    expression: "x = x0 + v0*t + a*t^2/2",
    distractorTemplates: [
      "x = x0 + v0*t + a*t^2",
      "x = x0 + v0*t - a*t^2/2",
      "x = x0 + v*t + a*t^2/2",
      "x = v0*t + a*t^2/2",
    ],
  },
  {
    id: "mech_kin_s_no_t",
    sectionId: "mechanics",
    subsectionId: "kinematics",
    title: "Путь без времени",
    expression: "s = (v^2 - v0^2)/(2*a)",
    distractorTemplates: [
      "s = (v^2 + v0^2)/(2*a)",
      "s = (v^2 - v0^2)/a",
      "s = (v - v0)/(2*a)",
      "s = (v^2 - v0^2)*2*a",
    ],
  },
  {
    id: "mech_kin_s_avg",
    sectionId: "mechanics",
    subsectionId: "kinematics",
    title: "Путь при равноускоренном движении в одну сторону",
    expression: "s = ((v0 + v)/2)*t",
    acceptedForms: ["s = (v0 + v)*t/2"],
    distractorTemplates: [
      "s = (v0 - v)*t/2",
      "s = (v0 + v)*2*t",
      "s = (v0 + v)/t",
      "s = v0*v*t/2",
    ],
  },

  // 8.2 Вращение
  {
    id: "mech_rot_T_tN",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Период по определению",
    expression: "T = t/N",
    distractorTemplates: ["T = N/t", "T = t*N", "T = 2*pi/N", "T = t*N/2"],
  },
  {
    id: "mech_rot_nu_Nt",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Частота по определению",
    expression: "nu = N/t",
    distractorTemplates: ["nu = t/N", "nu = N*t", "nu = 1/N", "nu = 2*pi*N/t"],
  },
  {
    id: "mech_rot_T_nu",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Связь периода и частоты",
    expression: "T = 1/nu",
    distractorTemplates: ["T = nu", "T = 2*pi/nu", "T = 1/(2*nu)", "T = nu/2"],
  },
  {
    id: "mech_rot_T_vR",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Период через линейную скорость",
    expression: "T = 2*pi*R/v",
    distractorTemplates: [
      "T = 2*pi*v/R",
      "T = 2*pi*R*v",
      "T = pi*R/v",
      "T = 2*R/v",
    ],
  },
  {
    id: "mech_rot_T_omega",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Период через угловую скорость",
    expression: "T = 2*pi/omega",
    distractorTemplates: [
      "T = 2*pi*omega",
      "T = omega/(2*pi)",
      "T = pi/omega",
      "T = 2/omega",
    ],
  },
  {
    id: "mech_rot_omega_def",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Угловая скорость по определению",
    expression: "omega = delta_phi/delta_t",
    distractorTemplates: [
      "omega = delta_t/delta_phi",
      "omega = delta_phi*delta_t",
      "omega = 2*pi/delta_t",
      "omega = delta_phi^2/delta_t",
    ],
  },
  {
    id: "mech_rot_omega_nu",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Угловая скорость через частоту",
    expression: "omega = 2*pi*nu",
    distractorTemplates: [
      "omega = 2*pi/nu",
      "omega = pi*nu",
      "omega = nu/(2*pi)",
      "omega = 2*nu",
    ],
  },
  {
    id: "mech_rot_v_omegaR",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Связь линейной и угловой скоростей",
    expression: "v = omega*R",
    distractorTemplates: [
      "v = omega/R",
      "v = R/omega",
      "v = omega*R^2",
      "v = 2*pi*omega*R",
    ],
  },
  {
    id: "mech_rot_ac_v",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Центростремительное ускорение через скорость",
    expression: "a_c = v^2/R",
    distractorTemplates: [
      "a_c = v/R",
      "a_c = v^2*R",
      "a_c = R/v^2",
      "a_c = v^2/(2*R)",
    ],
  },
  {
    id: "mech_rot_ac_omega",
    sectionId: "mechanics",
    subsectionId: "rotation",
    title: "Центростремительное ускорение через угловую скорость",
    expression: "a_c = omega^2*R",
    distractorTemplates: [
      "a_c = omega*R",
      "a_c = omega^2/R",
      "a_c = omega/R^2",
      "a_c = omega^2*R^2",
    ],
  },

  // 8.3 Динамика
  {
    id: "mech_dyn_rho",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Плотность",
    expression: "rho = m/V",
    distractorTemplates: ["rho = m*V", "rho = V/m", "rho = m/V^2", "rho = m+V"],
  },
  {
    id: "mech_dyn_FR_ma",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Второй закон Ньютона — равнодействующая",
    expression: "F_R = m*a",
    distractorTemplates: ["F_R = m/a", "F_R = a/m", "F_R = m+a", "F_R = m*a^2"],
  },
  {
    id: "mech_dyn_FR_dp",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Второй закон Ньютона в импульсной форме",
    expression: "F_R = delta_p/delta_t",
    distractorTemplates: [
      "F_R = delta_p*delta_t",
      "F_R = delta_t/delta_p",
      "F_R = delta_p^2/delta_t",
      "F_R = m*delta_p/delta_t",
    ],
  },
  {
    id: "mech_dyn_gravity",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Закон всемирного тяготения",
    expression: "F = G*m1*m2/r^2",
    distractorTemplates: [
      "F = G*m1*m2/r",
      "F = G*m1*m2*r^2",
      "F = k*m1*m2/r^2",
      "F = G*(m1+m2)/r^2",
    ],
  },
  {
    id: "mech_dyn_Ft",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Сила тяжести",
    expression: "F_t = m*g",
    distractorTemplates: ["F_t = m/g", "F_t = m+g", "F_t = m*g^2", "F_t = g/m"],
  },
  {
    id: "mech_dyn_Fupr",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Сила упругости",
    expression: "F_upr = k*delta_x",
    distractorTemplates: [
      "F_upr = k/delta_x",
      "F_upr = k*delta_l",
      "F_upr = k+delta_x",
      "F_upr = delta_x/k",
    ],
  },
  {
    id: "mech_dyn_Ftr",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Сила трения",
    expression: "F_tr = mu*N",
    distractorTemplates: ["F_tr = mu/N", "F_tr = N/mu", "F_tr = mu+N", "F_tr = mu*N^2"],
  },
  {
    id: "mech_dyn_p_FS",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Давление",
    expression: "p = F/S",
    distractorTemplates: ["p = F*S", "p = S/F", "p = F/S^2", "p = F+S"],
  },
  {
    id: "mech_dyn_F_pS",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Сила через давление",
    expression: "F = p*S",
    distractorTemplates: ["F = p/S", "F = S/p", "F = p+S", "F = p*S^2"],
  },
  {
    id: "mech_dyn_S_Fp",
    sectionId: "mechanics",
    subsectionId: "dynamics",
    title: "Площадь через давление",
    expression: "S = F/p",
    distractorTemplates: ["S = F*p", "S = p/F", "S = F/p^2", "S = F+p"],
  },

  // 8.4 Статика
  {
    id: "mech_stat_M",
    sectionId: "mechanics",
    subsectionId: "statics",
    title: "Момент силы",
    expression: "M = F*l",
    distractorTemplates: ["M = F/l", "M = l/F", "M = F+l", "M = F*l^2"],
  },
  {
    id: "mech_stat_F_Ml",
    sectionId: "mechanics",
    subsectionId: "statics",
    title: "Сила через момент",
    expression: "F = M/l",
    distractorTemplates: ["F = M*l", "F = l/M", "F = M/l^2", "F = M+l"],
  },
  {
    id: "mech_stat_FA",
    sectionId: "mechanics",
    subsectionId: "statics",
    title: "Сила Архимеда",
    expression: "F_A = rho_liquid*g*V_submerged",
    distractorTemplates: [
      "F_A = rho_liquid*g/V_submerged",
      "F_A = rho*g*V",
      "F_A = rho_liquid*V_submerged/g",
      "F_A = m*g*V_submerged",
    ],
  },
  {
    id: "mech_stat_p_column",
    sectionId: "mechanics",
    subsectionId: "statics",
    title: "Давление столба жидкости",
    expression: "p = rho*g*h",
    distractorTemplates: [
      "p = rho*g/h",
      "p = rho*h/g",
      "p = rho+g*h",
      "p = rho*g*h^2",
    ],
  },

  // 8.5 Законы сохранения
  {
    id: "mech_cons_p_mv",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Импульс тела",
    expression: "p = m*v",
    distractorTemplates: ["p = m/v", "p = v/m", "p = m*v^2", "p = m+v"],
  },
  {
    id: "mech_cons_m_pv",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Масса через импульс",
    expression: "m = p/v",
    distractorTemplates: ["m = p*v", "m = v/p", "m = p/v^2", "m = p+v"],
  },
  {
    id: "mech_cons_v_pm",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Скорость через импульс",
    expression: "v = p/m",
    distractorTemplates: ["v = p*m", "v = m/p", "v = p/m^2", "v = p+m"],
  },
  {
    id: "mech_cons_A_force",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Работа постоянной силы",
    expression: "A = F*s*cos(alpha)",
    distractorTemplates: [
      "A = F*s*sin(alpha)",
      "A = F*s/cos(alpha)",
      "A = F*s",
      "A = F*cos(alpha)/s",
    ],
  },
  {
    id: "mech_cons_Ek",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Кинетическая энергия",
    expression: "E_k = m*v^2/2",
    acceptedForms: ["E_k = (m*v^2)/2", "E_k = 1/2*m*v^2"],
    distractorTemplates: [
      "E_k = m*v/2",
      "E_k = m*v^2",
      "E_k = m^2*v/2",
      "E_k = 2*m*v^2",
    ],
  },
  {
    id: "mech_cons_v_Ek",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Скорость через кинетическую энергию",
    expression: "v = sqrt(2*E_k/m)",
    distractorTemplates: [
      "v = sqrt(E_k/m)",
      "v = sqrt(2*E_k*m)",
      "v = 2*E_k/m",
      "v = sqrt(2*m/E_k)",
    ],
  },
  {
    id: "mech_cons_Espring",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Потенциальная энергия пружины",
    expression: "E_spring = k*x^2/2",
    acceptedForms: ["E_spring = (k*x^2)/2", "E_spring = 1/2*k*x^2"],
    distractorTemplates: [
      "E_spring = k*x/2",
      "E_spring = k*x^2",
      "E_spring = k^2*x/2",
      "E_spring = 2*k*x^2",
    ],
  },
  {
    id: "mech_cons_Ep",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Потенциальная энергия тела на высоте",
    expression: "E_p = m*g*h",
    distractorTemplates: [
      "E_p = m*g/h",
      "E_p = m*h/g",
      "E_p = m*g*h^2",
      "E_p = m+g*h",
    ],
  },
  {
    id: "mech_cons_P_At",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Мощность по определению",
    expression: "P = A/t",
    distractorTemplates: ["P = A*t", "P = t/A", "P = A/t^2", "P = A+t"],
  },
  {
    id: "mech_cons_A_Pt",
    sectionId: "mechanics",
    subsectionId: "conservation",
    title: "Работа через мощность",
    expression: "A = P*t",
    distractorTemplates: ["A = P/t", "A = t/P", "A = P*t^2", "A = P+t"],
  },

  // 8.6 Колебания
  {
    id: "mech_osc_T_math",
    sectionId: "mechanics",
    subsectionId: "oscillations",
    title: "Период математического маятника",
    expression: "T = 2*pi*sqrt(l/g)",
    distractorTemplates: [
      "T = 2*pi*sqrt(g/l)",
      "T = 2*pi*sqrt(m/k)",
      "T = 2*pi*l/g",
      "T = pi*sqrt(l/g)",
    ],
  },
  {
    id: "mech_osc_T_spring",
    sectionId: "mechanics",
    subsectionId: "oscillations",
    title: "Период пружинного маятника",
    expression: "T = 2*pi*sqrt(m/k)",
    distractorTemplates: [
      "T = 2*pi*sqrt(k/m)",
      "T = 2*pi*sqrt(l/g)",
      "T = 2*pi*m/k",
      "T = pi*sqrt(m/k)",
    ],
  },
  {
    id: "mech_osc_vmax",
    sectionId: "mechanics",
    subsectionId: "oscillations",
    title: "Максимальная скорость гармонического колебания",
    expression: "v_max = omega*A",
    distractorTemplates: [
      "v_max = omega^2*A",
      "v_max = omega/A",
      "v_max = A/omega",
      "v_max = omega*A^2",
    ],
  },
  {
    id: "mech_osc_amax",
    sectionId: "mechanics",
    subsectionId: "oscillations",
    title: "Максимальное ускорение гармонического колебания",
    expression: "a_max = omega^2*A",
    distractorTemplates: [
      "a_max = omega*A",
      "a_max = omega^2/A",
      "a_max = A/omega^2",
      "a_max = omega*A^2",
    ],
  },
  {
    id: "mech_osc_v_lambda_nu",
    sectionId: "mechanics",
    subsectionId: "oscillations",
    title: "Скорость волны через частоту",
    expression: "v = lambda*nu",
    distractorTemplates: [
      "v = lambda/nu",
      "v = nu/lambda",
      "v = lambda*T",
      "v = lambda+nu",
    ],
  },
  {
    id: "mech_osc_v_lambda_T",
    sectionId: "mechanics",
    subsectionId: "oscillations",
    title: "Скорость волны через период",
    expression: "v = lambda/T",
    distractorTemplates: [
      "v = lambda*T",
      "v = T/lambda",
      "v = lambda*nu",
      "v = lambda/nu",
    ],
  },

  // 8.7 МКТ
  {
    id: "mol_mkt_n_NV",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Концентрация молекул",
    expression: "n = N/V",
    distractorTemplates: ["n = N*V", "n = V/N", "n = N/V^2", "n = N+V"],
  },
  {
    id: "mol_mkt_nu_mM",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Количество вещества через массу",
    expression: "nu = m/M",
    distractorTemplates: ["nu = m*M", "nu = M/m", "nu = m/N_A", "nu = m+M"],
  },
  {
    id: "mol_mkt_m_nuM",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Масса через количество вещества",
    expression: "m = nu*M",
    distractorTemplates: ["m = nu/M", "m = M/nu", "m = nu*N_A", "m = nu+M"],
  },
  {
    id: "mol_mkt_nu_N",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Количество вещества через число частиц",
    expression: "nu = N/N_A",
    distractorTemplates: ["nu = N*N_A", "nu = N_A/N", "nu = N/M", "nu = N+N_A"],
  },
  {
    id: "mol_mkt_N_nu",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Число частиц через количество вещества",
    expression: "N = nu*N_A",
    distractorTemplates: ["N = nu/N_A", "N = N_A/nu", "N = nu*M", "N = nu+N_A"],
  },
  {
    id: "mol_mkt_m0",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Масса одной молекулы",
    expression: "m0 = M/N_A",
    distractorTemplates: ["m0 = M*N_A", "m0 = N_A/M", "m0 = m/N_A", "m0 = M/n"],
  },
  {
    id: "mol_mkt_p_rms",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Основное уравнение МКТ через среднеквадратичную скорость",
    expression: "p = m0*n*v_rms^2/3",
    acceptedForms: ["p = (m0*n*v_rms^2)/3"],
    distractorTemplates: [
      "p = m0*n*v_rms^2",
      "p = m0*n*v_rms^2/2",
      "p = 3*m0*n*v_rms^2",
      "p = m0*n*v_rms/3",
    ],
  },
  {
    id: "mol_mkt_p_nkT",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Давление идеального газа через концентрацию и температуру",
    expression: "p = n*k*T",
    distractorTemplates: [
      "p = n*k/T",
      "p = n*R*T",
      "p = n*k*T/2",
      "p = n+k*T",
    ],
  },
  {
    id: "mol_mkt_p_Ek",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Давление через среднюю кинетическую энергию молекул",
    expression: "p = 2*n*E_k_avg/3",
    acceptedForms: ["p = (2*n*E_k_avg)/3"],
    distractorTemplates: [
      "p = 3*n*E_k_avg/2",
      "p = n*E_k_avg/3",
      "p = 2*n*E_k_avg",
      "p = 2*E_k_avg/(3*n)",
    ],
  },
  {
    id: "mol_mkt_Ek_def",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Средняя кинетическая энергия по определению",
    expression: "E_k_avg = m0*mean(v^2)/2",
    acceptedForms: ["E_k_avg = (m0*mean(v^2))/2"],
    distractorTemplates: [
      "E_k_avg = m0*mean(v^2)",
      "E_k_avg = m0*mean(v)/2",
      "E_k_avg = 3*k*T/2",
      "E_k_avg = m0*v_rms^2",
    ],
  },
  {
    id: "mol_mkt_Ek_T",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Средняя кинетическая энергия через температуру",
    expression: "E_k_avg = 3*k*T/2",
    acceptedForms: ["E_k_avg = (3*k*T)/2"],
    distractorTemplates: [
      "E_k_avg = 3*k*T",
      "E_k_avg = 2*k*T/3",
      "E_k_avg = 3*R*T/2",
      "E_k_avg = k*T/2",
    ],
  },
  {
    id: "mol_mkt_mendeleev",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Уравнение Менделеева — Клапейрона через количество вещества",
    expression: "p*V = nu*R*T",
    distractorTemplates: [
      "p*V = nu*R/T",
      "p*V = n*k*T",
      "p/V = nu*R*T",
      "p*V = nu*R*T^2",
    ],
  },
  {
    id: "mol_mkt_p_rho",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Уравнение Менделеева — Клапейрона через плотность",
    expression: "p = rho*R*T/M",
    distractorTemplates: [
      "p = rho*R*T*M",
      "p = rho*M/(R*T)",
      "p = rho*R*T",
      "p = R*T/(rho*M)",
    ],
  },
  {
    id: "mol_mkt_T_C",
    sectionId: "molecular",
    subsectionId: "mkt",
    title: "Перевод температуры из Цельсия в Кельвины",
    expression: "T = t_C + 273",
    distractorTemplates: [
      "T = t_C - 273",
      "T = t_C + 273.15",
      "T = t_C*273",
      "T = 273 - t_C",
    ],
  },

  // 8.8 Внутренняя энергия
  {
    id: "mol_u_U_nu",
    sectionId: "molecular",
    subsectionId: "internal_energy",
    title: "Внутренняя энергия одноатомного идеального газа",
    expression: "U = 3*nu*R*T/2",
    acceptedForms: ["U = (3*nu*R*T)/2"],
    distractorTemplates: [
      "U = 3*nu*R*T",
      "U = 5*nu*R*T/2",
      "U = 3*nu*R*T/2*p",
      "U = 2*nu*R*T/3",
    ],
  },
  {
    id: "mol_u_U_pV",
    sectionId: "molecular",
    subsectionId: "internal_energy",
    title: "Внутренняя энергия через давление и объём",
    expression: "U = 3*p*V/2",
    acceptedForms: ["U = (3*p*V)/2"],
    distractorTemplates: [
      "U = 3*p*V",
      "U = 2*p*V/3",
      "U = 5*p*V/2",
      "U = 3*p/V/2",
    ],
  },
  {
    id: "mol_u_deltaU",
    sectionId: "molecular",
    subsectionId: "internal_energy",
    title: "Изменение внутренней энергии одноатомного идеального газа",
    expression: "delta_U = 3*nu*R*delta_T/2",
    acceptedForms: ["delta_U = (3*nu*R*delta_T)/2"],
    distractorTemplates: [
      "delta_U = 3*nu*R*delta_T",
      "delta_U = 5*nu*R*delta_T/2",
      "delta_U = 2*nu*R*delta_T/3",
      "delta_U = 3*nu*R*T/2",
    ],
  },

  // 8.9 Влажность
  {
    id: "mol_hum_phi_p",
    sectionId: "molecular",
    subsectionId: "humidity",
    title: "Относительная влажность через давление пара",
    expression: "phi = p/p_sat*100%",
    acceptedForms: ["phi = (p/p_sat)*100", "phi = p/p_sat*100"],
    distractorTemplates: [
      "phi = p_sat/p*100%",
      "phi = p*p_sat*100%",
      "phi = p/p_sat",
      "phi = (p - p_sat)*100%",
    ],
  },
  {
    id: "mol_hum_phi_n",
    sectionId: "molecular",
    subsectionId: "humidity",
    title: "Относительная влажность через концентрацию",
    expression: "phi = n/n_sat*100%",
    acceptedForms: ["phi = (n/n_sat)*100", "phi = n/n_sat*100"],
    distractorTemplates: [
      "phi = n_sat/n*100%",
      "phi = n*n_sat*100%",
      "phi = n/n_sat",
      "phi = p/p_sat*100%",
    ],
  },
  {
    id: "mol_hum_phi_rho",
    sectionId: "molecular",
    subsectionId: "humidity",
    title: "Относительная влажность через плотность пара",
    expression: "phi = rho/rho_sat*100%",
    acceptedForms: ["phi = (rho/rho_sat)*100", "phi = rho/rho_sat*100"],
    distractorTemplates: [
      "phi = rho_sat/rho*100%",
      "phi = rho*rho_sat*100%",
      "phi = rho/rho_sat",
      "phi = n/n_sat*100%",
    ],
  },

  // 8.10 Количество теплоты
  {
    id: "th_heat_Q_c",
    sectionId: "thermodynamics",
    subsectionId: "heat",
    title: "Количество теплоты при нагревании и охлаждении",
    expression: "Q = c*m*delta_T",
    distractorTemplates: [
      "Q = c*m/delta_T",
      "Q = c*delta_T/m",
      "Q = lambda*m",
      "Q = c*m*T",
    ],
  },
  {
    id: "th_heat_Q_lambda",
    sectionId: "thermodynamics",
    subsectionId: "heat",
    title: "Количество теплоты при плавлении и кристаллизации",
    expression: "Q = lambda*m",
    distractorTemplates: [
      "Q = lambda/m",
      "Q = L*m",
      "Q = c*m*delta_T",
      "Q = lambda*m*delta_T",
    ],
  },
  {
    id: "th_heat_Q_L",
    sectionId: "thermodynamics",
    subsectionId: "heat",
    title: "Количество теплоты при парообразовании и конденсации",
    expression: "Q = L*m",
    distractorTemplates: [
      "Q = L/m",
      "Q = lambda*m",
      "Q = L*m*delta_T",
      "Q = c*m*delta_T",
    ],
  },

  // 8.11 Термодинамика
  {
    id: "th_thermo_A_pV",
    sectionId: "thermodynamics",
    subsectionId: "thermo",
    title: "Работа газа при изобарном процессе",
    expression: "A = p*delta_V",
    distractorTemplates: [
      "A = p/delta_V",
      "A = delta_V/p",
      "A = p*V",
      "A = p*delta_V^2",
    ],
  },
  {
    id: "th_thermo_first",
    sectionId: "thermodynamics",
    subsectionId: "thermo",
    title: "Первый закон термодинамики",
    expression: "Q = delta_U + A",
    distractorTemplates: [
      "Q = delta_U - A",
      "Q = delta_U*A",
      "Q = A - delta_U",
      "Q = delta_U/A",
    ],
  },
  {
    id: "th_thermo_eta_AQ",
    sectionId: "thermodynamics",
    subsectionId: "thermo",
    title: "КПД через работу и полученную теплоту",
    expression: "eta = A/Q_hot",
    distractorTemplates: [
      "eta = Q_hot/A",
      "eta = A/Q_cold",
      "eta = A*Q_hot",
      "eta = 1 - A/Q_hot",
    ],
  },
  {
    id: "th_thermo_eta_QQ",
    sectionId: "thermodynamics",
    subsectionId: "thermo",
    title: "КПД через отношение холодной и горячей теплот",
    expression: "eta = 1 - Q_cold/Q_hot",
    distractorTemplates: [
      "eta = 1 - Q_hot/Q_cold",
      "eta = Q_cold/Q_hot",
      "eta = 1 + Q_cold/Q_hot",
      "eta = Q_hot/Q_cold - 1",
    ],
  },
  {
    id: "th_thermo_eta_diff",
    sectionId: "thermodynamics",
    subsectionId: "thermo",
    title: "КПД через разность теплот",
    expression: "eta = (Q_hot - Q_cold)/Q_hot",
    distractorTemplates: [
      "eta = (Q_hot - Q_cold)/Q_cold",
      "eta = (Q_cold - Q_hot)/Q_hot",
      "eta = Q_hot - Q_cold",
      "eta = Q_hot/(Q_hot - Q_cold)",
    ],
  },
  {
    id: "th_thermo_eta_carnot",
    sectionId: "thermodynamics",
    subsectionId: "thermo",
    title: "КПД цикла Карно",
    expression: "eta = 1 - T_cold/T_hot",
    distractorTemplates: [
      "eta = 1 - T_hot/T_cold",
      "eta = T_cold/T_hot",
      "eta = 1 - Q_cold/Q_hot",
      "eta = (T_hot - T_cold)/T_cold",
    ],
  },

  // 8.12 Электростатика
  {
    id: "el_es_coulomb",
    sectionId: "electrostatics",
    subsectionId: "electrostatics",
    title: "Закон Кулона",
    expression: "F = k*abs(q1*q2)/r^2",
    acceptedForms: ["F = k*abs(q1)*abs(q2)/r^2"],
    distractorTemplates: [
      "F = k*q1*q2/r^2",
      "F = k*abs(q1*q2)/r",
      "F = G*abs(q1*q2)/r^2",
      "F = k*abs(q1*q2)*r^2",
    ],
  },
  {
    id: "el_es_E_Fq",
    sectionId: "electrostatics",
    subsectionId: "electrostatics",
    title: "Напряжённость электрического поля по определению",
    expression: "E = F/q",
    distractorTemplates: ["E = F*q", "E = q/F", "E = F/q^2", "E = U/d"],
  },
  {
    id: "el_es_F_qE",
    sectionId: "electrostatics",
    subsectionId: "electrostatics",
    title: "Сила, действующая на заряд в поле",
    expression: "F = q*E",
    distractorTemplates: ["F = q/E", "F = E/q", "F = q*E^2", "F = q+E"],
  },
  {
    id: "el_es_E_point",
    sectionId: "electrostatics",
    subsectionId: "electrostatics",
    title: "Напряжённость поля точечного заряда",
    expression: "E = k*abs(Q)/r^2",
    distractorTemplates: [
      "E = k*Q/r^2",
      "E = k*abs(Q)/r",
      "E = k*abs(Q)*r^2",
      "E = F/q",
    ],
  },
  {
    id: "el_es_A_qU",
    sectionId: "electrostatics",
    subsectionId: "electrostatics",
    title: "Работа электрического поля",
    expression: "A = q*U",
    distractorTemplates: ["A = q/U", "A = U/q", "A = q*E", "A = q*U^2"],
  },
  {
    id: "el_es_U_Ed",
    sectionId: "electrostatics",
    subsectionId: "electrostatics",
    title: "Напряжение через напряжённость однородного поля",
    expression: "U = E*d",
    distractorTemplates: ["U = E/d", "U = d/E", "U = E*d^2", "U = q*E"],
  },
  {
    id: "el_es_E_Ud",
    sectionId: "electrostatics",
    subsectionId: "electrostatics",
    title: "Напряжённость через напряжение",
    expression: "E = U/d",
    distractorTemplates: ["E = U*d", "E = d/U", "E = U/d^2", "E = F/q"],
  },
  {
    id: "el_es_q_AU",
    sectionId: "electrostatics",
    subsectionId: "electrostatics",
    title: "Заряд через работу и напряжение",
    expression: "q = A/U",
    distractorTemplates: ["q = A*U", "q = U/A", "q = A/U^2", "q = C*U"],
  },

  // 8.13 Конденсаторы
  {
    id: "el_cap_C_qU",
    sectionId: "electrostatics",
    subsectionId: "capacitors",
    title: "Электроёмкость через заряд и напряжение",
    expression: "C = q/U",
    distractorTemplates: ["C = q*U", "C = U/q", "C = q/U^2", "C = q^2/U"],
  },
  {
    id: "el_cap_q_CU",
    sectionId: "electrostatics",
    subsectionId: "capacitors",
    title: "Заряд конденсатора",
    expression: "q = C*U",
    distractorTemplates: ["q = C/U", "q = U/C", "q = C*U^2", "q = A/U"],
  },
  {
    id: "el_cap_U_qC",
    sectionId: "electrostatics",
    subsectionId: "capacitors",
    title: "Напряжение конденсатора",
    expression: "U = q/C",
    distractorTemplates: ["U = q*C", "U = C/q", "U = q/C^2", "U = E*d"],
  },
  {
    id: "el_cap_C_flat",
    sectionId: "electrostatics",
    subsectionId: "capacitors",
    title: "Электроёмкость плоского конденсатора",
    expression: "C = epsilon*epsilon0*S/d",
    distractorTemplates: [
      "C = epsilon*epsilon0*d/S",
      "C = epsilon*epsilon0*S*d",
      "C = epsilon0*S/d",
      "C = epsilon*S/(epsilon0*d)",
    ],
  },
  {
    id: "el_cap_series",
    sectionId: "electrostatics",
    subsectionId: "capacitors",
    title: "Общая ёмкость двух последовательно соединённых конденсаторов",
    expression: "1/C = 1/C1 + 1/C2",
    distractorTemplates: [
      "C = C1 + C2",
      "1/C = 1/C1 - 1/C2",
      "C = 1/C1 + 1/C2",
      "1/C = C1 + C2",
    ],
  },
  {
    id: "el_cap_parallel",
    sectionId: "electrostatics",
    subsectionId: "capacitors",
    title: "Общая ёмкость двух параллельно соединённых конденсаторов",
    expression: "C = C1 + C2",
    distractorTemplates: [
      "1/C = 1/C1 + 1/C2",
      "C = C1*C2",
      "C = C1 - C2",
      "C = 1/C1 + 1/C2",
    ],
  },
  {
    id: "el_cap_W_CU",
    sectionId: "electrostatics",
    subsectionId: "capacitors",
    title: "Энергия конденсатора через ёмкость и напряжение",
    expression: "W = C*U^2/2",
    acceptedForms: ["W = (C*U^2)/2", "W = 1/2*C*U^2"],
    distractorTemplates: [
      "W = C*U/2",
      "W = C*U^2",
      "W = q*U/2",
      "W = 2*C*U^2",
    ],
  },
  {
    id: "el_cap_W_qU",
    sectionId: "electrostatics",
    subsectionId: "capacitors",
    title: "Энергия конденсатора через заряд и напряжение",
    expression: "W = q*U/2",
    acceptedForms: ["W = (q*U)/2"],
    distractorTemplates: [
      "W = q*U",
      "W = q*U^2/2",
      "W = C*U^2/2",
      "W = 2*q*U",
    ],
  },
  {
    id: "el_cap_W_qC",
    sectionId: "electrostatics",
    subsectionId: "capacitors",
    title: "Энергия конденсатора через заряд и ёмкость",
    expression: "W = q^2/(2*C)",
    distractorTemplates: [
      "W = q^2/C",
      "W = q^2*2*C",
      "W = q/(2*C)",
      "W = 2*q^2/C",
    ],
  },

  // 8.14 Постоянный ток
  {
    id: "cur_dc_I_qt",
    sectionId: "current",
    subsectionId: "dc",
    title: "Сила тока по определению",
    expression: "I = q/t",
    distractorTemplates: ["I = q*t", "I = t/q", "I = q/t^2", "I = U/R"],
  },
  {
    id: "cur_dc_q_It",
    sectionId: "current",
    subsectionId: "dc",
    title: "Заряд через силу тока",
    expression: "q = I*t",
    distractorTemplates: ["q = I/t", "q = t/I", "q = I*t^2", "q = C*U"],
  },
  {
    id: "cur_dc_R_rho",
    sectionId: "current",
    subsectionId: "dc",
    title: "Сопротивление проводника",
    expression: "R = rho*l/S",
    distractorTemplates: [
      "R = rho*S/l",
      "R = rho*l*S",
      "R = l/(rho*S)",
      "R = U/I",
    ],
  },
  {
    id: "cur_dc_ohm_I",
    sectionId: "current",
    subsectionId: "dc",
    title: "Закон Ома для участка цепи",
    expression: "I = U/R",
    distractorTemplates: ["I = U*R", "I = R/U", "I = U/r", "I = EMF/(R+r)"],
  },
  {
    id: "cur_dc_ohm_U",
    sectionId: "current",
    subsectionId: "dc",
    title: "Напряжение на участке цепи",
    expression: "U = I*R",
    distractorTemplates: ["U = I/R", "U = R/I", "U = I*(R+r)", "U = EMF - I*r"],
  },
  {
    id: "cur_dc_ohm_R",
    sectionId: "current",
    subsectionId: "dc",
    title: "Сопротивление через ток и напряжение",
    expression: "R = U/I",
    distractorTemplates: ["R = U*I", "R = I/U", "R = rho*l/S", "R = U/I^2"],
  },
  {
    id: "cur_dc_ohm_full",
    sectionId: "current",
    subsectionId: "dc",
    title: "Закон Ома для полной цепи",
    expression: "I = EMF/(R+r)",
    distractorTemplates: [
      "I = EMF/(R-r)",
      "I = EMF/R",
      "I = (R+r)/EMF",
      "I = EMF*(R+r)",
    ],
  },
  {
    id: "cur_dc_EMF_Ir",
    sectionId: "current",
    subsectionId: "dc",
    title: "ЭДС через ток и сопротивления",
    expression: "EMF = I*(R+r)",
    distractorTemplates: [
      "EMF = I*(R-r)",
      "EMF = I*R",
      "EMF = I/(R+r)",
      "EMF = U + I*r",
    ],
  },
  {
    id: "cur_dc_U_external",
    sectionId: "current",
    subsectionId: "dc",
    title: "Напряжение на внешнем участке полной цепи",
    expression: "U = EMF - I*r",
    distractorTemplates: [
      "U = EMF + I*r",
      "U = EMF - I*R",
      "U = EMF*I*r",
      "U = I*(R+r)",
    ],
  },

  // 8.15 Соединения
  {
    id: "cur_sp_I_series",
    sectionId: "current",
    subsectionId: "series_parallel",
    title: "Ток при последовательном соединении",
    expression: "I = I1 = I2",
    acceptedForms: ["I = I1", "I1 = I2", "I = I2"],
    distractorTemplates: [
      "I = I1 + I2",
      "I = I1*I2",
      "U = U1 = U2",
      "I = I1 - I2",
    ],
    symbolicCheck: false,
  },
  {
    id: "cur_sp_U_series",
    sectionId: "current",
    subsectionId: "series_parallel",
    title: "Напряжение при последовательном соединении",
    expression: "U = U1 + U2",
    distractorTemplates: [
      "U = U1 = U2",
      "U = U1*U2",
      "U = U1 - U2",
      "I = I1 + I2",
    ],
  },
  {
    id: "cur_sp_R_series",
    sectionId: "current",
    subsectionId: "series_parallel",
    title: "Общее сопротивление при последовательном соединении",
    expression: "R = R1 + R2",
    distractorTemplates: [
      "1/R = 1/R1 + 1/R2",
      "R = R1*R2",
      "R = R1 - R2",
      "R = R1 = R2",
    ],
  },
  {
    id: "cur_sp_U_parallel",
    sectionId: "current",
    subsectionId: "series_parallel",
    title: "Напряжение при параллельном соединении",
    expression: "U = U1 = U2",
    acceptedForms: ["U = U1", "U1 = U2", "U = U2"],
    distractorTemplates: [
      "U = U1 + U2",
      "I = I1 = I2",
      "U = U1*U2",
      "U = U1 - U2",
    ],
    symbolicCheck: false,
  },
  {
    id: "cur_sp_I_parallel",
    sectionId: "current",
    subsectionId: "series_parallel",
    title: "Ток при параллельном соединении",
    expression: "I = I1 + I2",
    distractorTemplates: [
      "I = I1 = I2",
      "I = I1*I2",
      "U = U1 + U2",
      "I = I1 - I2",
    ],
  },

  // 8.16 Джоуль — Ленц
  {
    id: "cur_jl_Q_I2",
    sectionId: "current",
    subsectionId: "joule",
    title: "Закон Джоуля — Ленца",
    expression: "Q = I^2*R*t",
    distractorTemplates: [
      "Q = I*R*t",
      "Q = I^2*R/t",
      "Q = U*I*t",
      "Q = I^2*t/R",
    ],
  },
  {
    id: "cur_jl_Q_UI",
    sectionId: "current",
    subsectionId: "joule",
    title: "Количество теплоты через напряжение и ток",
    expression: "Q = U*I*t",
    distractorTemplates: [
      "Q = U*I/t",
      "Q = U^2*t/R",
      "Q = I^2*R*t",
      "Q = U*I",
    ],
  },
  {
    id: "cur_jl_Q_U2",
    sectionId: "current",
    subsectionId: "joule",
    title: "Количество теплоты через напряжение и сопротивление",
    expression: "Q = U^2*t/R",
    distractorTemplates: [
      "Q = U^2*R*t",
      "Q = U*t/R",
      "Q = U^2*t*R",
      "Q = I^2*R*t",
    ],
  },
  {
    id: "cur_jl_P_UI",
    sectionId: "current",
    subsectionId: "joule",
    title: "Мощность электрического тока",
    expression: "P = U*I",
    distractorTemplates: ["P = U/I", "P = I/U", "P = U*I*t", "P = I^2*R"],
  },
  {
    id: "cur_jl_P_I2",
    sectionId: "current",
    subsectionId: "joule",
    title: "Мощность через ток и сопротивление",
    expression: "P = I^2*R",
    distractorTemplates: ["P = I*R", "P = I^2/R", "P = U^2/R", "P = U*I"],
  },
  {
    id: "cur_jl_P_U2",
    sectionId: "current",
    subsectionId: "joule",
    title: "Мощность через напряжение и сопротивление",
    expression: "P = U^2/R",
    distractorTemplates: ["P = U^2*R", "P = U/R", "P = I^2*R", "P = U*I"],
  },
  {
    id: "cur_jl_A_UIt",
    sectionId: "current",
    subsectionId: "joule",
    title: "Работа электрического тока",
    expression: "A = U*I*t",
    distractorTemplates: ["A = U*I", "A = P*t", "A = U*I/t", "A = I^2*R*t"],
  },
  {
    id: "cur_jl_A_Pt",
    sectionId: "current",
    subsectionId: "joule",
    title: "Работа через мощность",
    expression: "A = P*t",
    distractorTemplates: ["A = P/t", "A = U*I*t", "A = P*t^2", "A = t/P"],
  },

  // 8.17 Магнетизм
  {
    id: "mag_ampere",
    sectionId: "magnetism",
    subsectionId: "magnetism",
    title: "Сила Ампера",
    expression: "F_A = B*I*l*sin(alpha)",
    distractorTemplates: [
      "F_A = B*I*l*cos(alpha)",
      "F_A = B*I*l",
      "F_L = abs(q)*v*B*sin(alpha)",
      "F_A = B*I*l/sin(alpha)",
    ],
  },
  {
    id: "mag_lorentz",
    sectionId: "magnetism",
    subsectionId: "magnetism",
    title: "Сила Лоренца",
    expression: "F_L = abs(q)*v*B*sin(alpha)",
    distractorTemplates: [
      "F_L = q*v*B*sin(alpha)",
      "F_L = abs(q)*v*B*cos(alpha)",
      "F_A = B*I*l*sin(alpha)",
      "F_L = abs(q)*v*B",
    ],
  },

  // 8.18 Индукция
  {
    id: "mag_ind_Phi",
    sectionId: "magnetism",
    subsectionId: "induction",
    title: "Магнитный поток",
    expression: "Phi = B*S*cos(alpha)",
    distractorTemplates: [
      "Phi = B*S*sin(alpha)",
      "Phi = B*S",
      "Phi = B*S/cos(alpha)",
      "Phi = B/S*cos(alpha)",
    ],
  },
  {
    id: "mag_ind_faraday",
    sectionId: "magnetism",
    subsectionId: "induction",
    title: "Закон Фарадея",
    expression: "EMF_i = -delta_Phi/delta_t",
    distractorTemplates: [
      "EMF_i = delta_Phi/delta_t",
      "EMF_i = -delta_Phi*delta_t",
      "EMF_si = -L*delta_I/delta_t",
      "EMF_i = -delta_t/delta_Phi",
    ],
  },
  {
    id: "mag_ind_moving",
    sectionId: "magnetism",
    subsectionId: "induction",
    title: "ЭДС движущегося проводника",
    expression: "EMF = B*l*v*sin(alpha)",
    distractorTemplates: [
      "EMF = B*l*v*cos(alpha)",
      "EMF = B*l*v",
      "EMF_i = -delta_Phi/delta_t",
      "EMF = B*l*v/sin(alpha)",
    ],
  },

  // 8.19 Индуктивность
  {
    id: "mag_L_def",
    sectionId: "magnetism",
    subsectionId: "inductance",
    title: "Индуктивность",
    expression: "L = Phi/I",
    distractorTemplates: [
      "L = Phi*I",
      "L = I/Phi",
      "L = N*Phi/I",
      "L = Phi/I^2",
    ],
  },
  {
    id: "mag_L_self",
    sectionId: "magnetism",
    subsectionId: "inductance",
    title: "ЭДС самоиндукции",
    expression: "EMF_si = -L*delta_I/delta_t",
    distractorTemplates: [
      "EMF_si = L*delta_I/delta_t",
      "EMF_i = -delta_Phi/delta_t",
      "EMF_si = -L*delta_t/delta_I",
      "EMF_si = -L*delta_I*delta_t",
    ],
  },
  {
    id: "mag_L_W",
    sectionId: "magnetism",
    subsectionId: "inductance",
    title: "Энергия магнитного поля катушки",
    expression: "W = L*I^2/2",
    acceptedForms: ["W = (L*I^2)/2", "W = 1/2*L*I^2"],
    distractorTemplates: [
      "W = L*I/2",
      "W = L*I^2",
      "W = C*U^2/2",
      "W = 2*L*I^2",
    ],
  },

  // 8.20 ЭМ колебания
  {
    id: "mag_em_thomson",
    sectionId: "magnetism",
    subsectionId: "em_oscillations",
    title: "Формула Томсона",
    expression: "T = 2*pi*sqrt(L*C)",
    distractorTemplates: [
      "T = 2*pi*sqrt(L/C)",
      "T = 2*pi*sqrt(m/k)",
      "T = 2*pi*L*C",
      "T = 2*pi*sqrt(L+C)",
    ],
  },
  {
    id: "mag_em_Imax",
    sectionId: "magnetism",
    subsectionId: "em_oscillations",
    title: "Связь максимального заряда и максимального тока",
    expression: "I_max = omega*q_max",
    distractorTemplates: [
      "I_max = omega/q_max",
      "I_max = q_max/omega",
      "I_max = omega^2*q_max",
      "v_max = omega*A",
    ],
  },

  // 8.21 Тонкая линза
  {
    id: "opt_lens_thin",
    sectionId: "optics",
    subsectionId: "thin_lens",
    title: "Формула тонкой линзы",
    expression: "1/F = 1/d + 1/f",
    distractorTemplates: [
      "1/F = 1/d - 1/f",
      "F = 1/d + 1/f",
      "1/F = d + f",
      "1/D = 1/d + 1/f",
    ],
    notes:
      "F — фокусное расстояние (согласованное обозначение каталога). Не путать с силой D.",
  },
  {
    id: "opt_lens_D",
    sectionId: "optics",
    subsectionId: "thin_lens",
    title: "Оптическая сила линзы через фокусное расстояние",
    expression: "D = 1/F",
    distractorTemplates: ["D = F", "D = 1/f", "D = F/d", "1/F = 1/d + 1/f"],
    notes:
      "F — то же фокусное расстояние, что в формуле тонкой линзы (без индекса).",
  },
  {
    id: "opt_lens_gamma",
    sectionId: "optics",
    subsectionId: "thin_lens",
    title: "Линейное увеличение линзы",
    expression: "Gamma = H/h = f/d",
    acceptedForms: ["Gamma = H/h", "Gamma = f/d", "H/h = f/d"],
    distractorTemplates: [
      "Gamma = h/H",
      "Gamma = d/f",
      "Gamma = H*h",
      "Gamma = f*d",
    ],
    symbolicCheck: false,
  },

  // 8.22 Преломление и дифракция
  {
    id: "opt_snell",
    sectionId: "optics",
    subsectionId: "refraction_diffraction",
    title: "Закон преломления Снеллиуса",
    expression: "n1*sin(alpha) = n2*sin(beta)",
    distractorTemplates: [
      "n1*sin(alpha) = n2*cos(beta)",
      "n1*cos(alpha) = n2*sin(beta)",
      "n1/sin(alpha) = n2/sin(beta)",
      "n1*sin(beta) = n2*sin(alpha)",
    ],
  },
  {
    id: "opt_v_cn",
    sectionId: "optics",
    subsectionId: "refraction_diffraction",
    title: "Скорость света через показатель преломления",
    expression: "v = c/n",
    distractorTemplates: ["v = c*n", "v = n/c", "v = c/n^2", "v = lambda*nu"],
  },
  {
    id: "opt_diff_grating",
    sectionId: "optics",
    subsectionId: "refraction_diffraction",
    title: "Условие максимумов дифракционной решётки",
    expression: "d*sin(phi) = m*lambda",
    distractorTemplates: [
      "d*sin(phi) = (m+1/2)*lambda",
      "b*sin(phi) = m*lambda",
      "d*cos(phi) = m*lambda",
      "d*sin(phi) = lambda/m",
    ],
  },
  {
    id: "opt_diff_slit",
    sectionId: "optics",
    subsectionId: "refraction_diffraction",
    title: "Условие минимумов для одной щели",
    expression: "b*sin(phi) = m*lambda",
    distractorTemplates: [
      "d*sin(phi) = m*lambda",
      "b*sin(phi) = (m+1/2)*lambda",
      "b*cos(phi) = m*lambda",
      "b*sin(phi) = lambda/m",
    ],
  },

  // 8.23 Фотон
  {
    id: "qu_ph_E_nu",
    sectionId: "quantum",
    subsectionId: "photon",
    title: "Энергия фотона через частоту",
    expression: "E = h*nu",
    distractorTemplates: ["E = h/nu", "E = h*c/lambda", "E = h*nu/c", "E = p*c"],
  },
  {
    id: "qu_ph_E_lambda",
    sectionId: "quantum",
    subsectionId: "photon",
    title: "Энергия фотона через длину волны",
    expression: "E = h*c/lambda",
    distractorTemplates: [
      "E = h*lambda/c",
      "E = h*c*lambda",
      "E = h*nu",
      "E = h/lambda",
    ],
  },
  {
    id: "qu_ph_E_pc",
    sectionId: "quantum",
    subsectionId: "photon",
    title: "Энергия фотона через импульс",
    expression: "E = p*c",
    distractorTemplates: ["E = p/c", "E = h*nu", "E = p*c^2", "E = h/lambda"],
  },
  {
    id: "qu_ph_p_E",
    sectionId: "quantum",
    subsectionId: "photon",
    title: "Импульс фотона через энергию",
    expression: "p = E/c",
    distractorTemplates: ["p = E*c", "p = E/c^2", "p = h/lambda", "p = h*nu/c"],
  },
  {
    id: "qu_ph_p_nu",
    sectionId: "quantum",
    subsectionId: "photon",
    title: "Импульс фотона через частоту",
    expression: "p = h*nu/c",
    distractorTemplates: [
      "p = h*c/nu",
      "p = h*nu*c",
      "p = h/lambda",
      "p = E/c",
    ],
  },
  {
    id: "qu_ph_p_lambda",
    sectionId: "quantum",
    subsectionId: "photon",
    title: "Импульс фотона через длину волны",
    expression: "p = h/lambda",
    distractorTemplates: [
      "p = h*lambda",
      "p = lambda/h",
      "p = h*nu/c",
      "p = h*c/lambda",
    ],
  },

  // 8.24 Фотоэффект
  {
    id: "qu_pe_einstein",
    sectionId: "quantum",
    subsectionId: "photoeffect",
    title: "Уравнение Эйнштейна для фотоэффекта",
    expression: "h*nu = A_work + m*v_max^2/2",
    acceptedForms: ["h*nu = A_work + (m*v_max^2)/2"],
    distractorTemplates: [
      "h*nu = A_work - m*v_max^2/2",
      "h*nu = A_work + m*v_max^2",
      "E_k_max = h*nu - A_work",
      "h*nu = A_work + m*v_max/2",
    ],
  },
  {
    id: "qu_pe_Ek",
    sectionId: "quantum",
    subsectionId: "photoeffect",
    title: "Максимальная кинетическая энергия фотоэлектрона",
    expression: "E_k_max = h*nu - A_work",
    distractorTemplates: [
      "E_k_max = h*nu + A_work",
      "E_k_max = A_work - h*nu",
      "E_k_max = h*nu",
      "nu_0 = A_work/h",
    ],
  },
  {
    id: "qu_pe_nu0",
    sectionId: "quantum",
    subsectionId: "photoeffect",
    title: "Красная граница фотоэффекта через частоту",
    expression: "nu_0 = A_work/h",
    distractorTemplates: [
      "nu_0 = h/A_work",
      "nu_0 = A_work*h",
      "nu_0 = A_work/h*c",
      "E_k_max = h*nu - A_work",
    ],
  },

  // 8.25 Распад
  {
    id: "qu_rad_decay",
    sectionId: "quantum",
    subsectionId: "radioactive",
    title: "Закон радиоактивного распада",
    expression: "N = N0*2^(-t/T)",
    distractorTemplates: [
      "N = N0*2^(-T/t)",
      "N = N0*2^(t/T)",
      "N = N0*e^(-t/T)",
      "N = N0/2^(-t/T)",
    ],
  },
];

export const FORMULA_CATALOG: FormulaCard[] = DRAFTS.map(card);

export const FORMULA_BY_ID: ReadonlyMap<string, FormulaCard> = new Map(
  FORMULA_CATALOG.map((f) => [f.id, f])
);

export function getFormula(id: string): FormulaCard | undefined {
  return FORMULA_BY_ID.get(id);
}

export function listSubsections(): {
  sectionId: FormulaSectionId;
  sectionTitle: string;
  subsectionId: FormulaSubsectionId;
  subsectionTitle: string;
  count: number;
}[] {
  const map = new Map<
    string,
    {
      sectionId: FormulaSectionId;
      sectionTitle: string;
      subsectionId: FormulaSubsectionId;
      subsectionTitle: string;
      count: number;
    }
  >();
  for (const f of FORMULA_CATALOG) {
    const key = `${f.sectionId}:${f.subsectionId}`;
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else {
      map.set(key, {
        sectionId: f.sectionId,
        sectionTitle: f.sectionTitle,
        subsectionId: f.subsectionId,
        subsectionTitle: f.subsectionTitle,
        count: 1,
      });
    }
  }
  return [...map.values()];
}

export function allSubsectionIds(): FormulaSubsectionId[] {
  return [...new Set(FORMULA_CATALOG.map((f) => f.subsectionId))];
}

export function formulasInSubsections(
  subsectionIds: FormulaSubsectionId[] | null | undefined
): FormulaCard[] {
  if (!subsectionIds || subsectionIds.length === 0) return [...FORMULA_CATALOG];
  const set = new Set(subsectionIds);
  return FORMULA_CATALOG.filter((f) => set.has(f.subsectionId));
}

export const TRAINER_GROUPS: {
  id: TrainerGroupId;
  title: string;
  sectionIds: FormulaSectionId[];
}[] = [
  { id: "mechanics", title: "Механика", sectionIds: ["mechanics"] },
  {
    id: "mkt_thermo",
    title: "МКТ и термодинамика",
    sectionIds: ["molecular", "thermodynamics"],
  },
  {
    id: "electricity",
    title: "Электричество",
    sectionIds: ["electrostatics", "current", "magnetism"],
  },
  {
    id: "optics_quantum",
    title: "Оптика и квантовая физика",
    sectionIds: ["optics", "quantum"],
  },
];

export function groupBySectionId(
  sectionId: FormulaSectionId
): (typeof TRAINER_GROUPS)[number] {
  return (
    TRAINER_GROUPS.find((g) => g.sectionIds.includes(sectionId)) ??
    TRAINER_GROUPS[0]!
  );
}

export function subsectionsForGroup(groupId: TrainerGroupId): FormulaSubsectionId[] {
  const group = TRAINER_GROUPS.find((g) => g.id === groupId);
  if (!group) return [];
  const sections = new Set<FormulaSectionId>(group.sectionIds);
  return [
    ...new Set(
      FORMULA_CATALOG.filter((f) => sections.has(f.sectionId)).map(
        (f) => f.subsectionId
      )
    ),
  ];
}

export function inferSelectedGroup(
  ids: FormulaSubsectionId[]
): TrainerGroupId | "all" {
  const set = new Set(ids);
  if (set.size === 0) return "all";
  const all = allSubsectionIds();
  if (all.length === set.size && all.every((id) => set.has(id))) return "all";

  let best: TrainerGroupId | "all" = "all";
  let bestCount = 0;
  for (const g of TRAINER_GROUPS) {
    const subs = subsectionsForGroup(g.id);
    const n = subs.filter((id) => set.has(id)).length;
    if (n > bestCount) {
      bestCount = n;
      best = g.id;
    }
  }
  return bestCount > 0 ? best : "all";
}

export { SECTION_TITLES, SUBSECTION_TITLES };
