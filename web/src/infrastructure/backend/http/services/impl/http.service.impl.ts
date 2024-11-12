import { injectable } from "inversify/lib/annotation/injectable";
import { HttpService } from "../../../../../core/http/services/http.service";
import { env } from "../../../../../core/shared/env";

@injectable()
class HttpServiceImpl implements HttpService {
  async get<T>(path: string): Promise<T> {
    const url = `${env.API_URL}${path}`;
    try {
      const response = await fetch(url);
      return response.json();
    } catch (error) {
      console.error(`Failed to fetch data from ${url}`, error);
      throw error;
    }

  }

  async getYAML(path: string): Promise<string> {
    const url = `${env.API_URL}${path}`;
    try {
      const response = await fetch(url);
      const contentType = response.headers.get("Content-Type");
      if (contentType && contentType.includes("application/x-yaml")) {
        return response.text();
      } else {
        throw new Error(`Expected YAML response from ${url}, but got ${contentType}`);
      }
    } catch (error) {
      console.error(`Failed to fetch data from ${url}`, error);
      throw error;
    }

  }

  async post<I, T>(path: string, data: I): Promise<T> {
    const response = await fetch(`${env.API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async patch<I, T>(path: string, data: I): Promise<T> {
    try {
      const response = await fetch(`${env.API_URL}${path}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      return await response.json();
    } catch (error) {
      console.error(`Failed to send PATCH request to ${path}`, error);
      throw error;
    }
  }
}

export { HttpServiceImpl };
