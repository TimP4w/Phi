import { injectable } from "inversify";
import { addToast } from "@heroui/react";
import type { Notifier } from "../../core/shared/notifier";

// ToastNotifier is the only place that turns Notifier calls into Hero UI toasts.
@injectable()
export class ToastNotifier implements Notifier {
  success(title: string, description?: string): void {
    addToast({ title, description, color: "success" });
  }

  error(title: string, description?: string): void {
    addToast({ title, description, color: "danger" });
  }
}
