import { injectable } from "inversify";
import { toast } from "@heroui/react";
import type { Notifier } from "../../core/shared/notifier";

@injectable()
export class ToastNotifier implements Notifier {
  success(title: string, description?: string): void {
    toast.success(title, { description });
  }

  error(title: string, description?: string): void {
    toast.danger(title, { description });
  }
}
