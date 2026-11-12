import { LandingSection } from "@/components/landing/landing-section";
import { landingCompare } from "@/lib/landing/content";

export function CompareSection() {
  return (
    <LandingSection
      id="compare"
      eyebrow="Отличия"
      title="Чем это отличается"
      description={landingCompare.note}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption className="sr-only">
            Сравнение разрозненных занятий и подготовки в «Неодин»
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="w-[22%] py-3 pr-4 text-sm font-medium text-muted-foreground"
              >
                Что сравниваем
              </th>
              <th
                scope="col"
                className="w-[39%] py-3 pr-4 font-display text-lg font-semibold"
              >
                {landingCompare.left}
              </th>
              <th
                scope="col"
                className="w-[39%] py-3 font-display text-lg font-semibold"
              >
                {landingCompare.right}
              </th>
            </tr>
          </thead>
          <tbody>
            {landingCompare.rows.map((row) => (
              <tr key={row.id} className="border-b border-border align-top">
                <th scope="row" className="py-4 pr-4 text-sm font-medium">
                  {row.topic}
                </th>
                <td className="py-4 pr-4 text-sm leading-relaxed text-muted-foreground">
                  {row.left}
                </td>
                <td className="py-4 text-sm leading-relaxed text-foreground">
                  {row.right}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LandingSection>
  );
}
