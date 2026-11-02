import { StudentTourMaterialLocked } from "@/components/student-tour/material-locked";

export default function StudentTourCheckoutPage() {
  return (
    <StudentTourMaterialLocked
      title="Оплата в демо недоступна"
      description="Заявки на оплату и банковские переходы работают только у подключённых учеников. В демо можно посмотреть историю тарифа и статусы."
    />
  );
}
