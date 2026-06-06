import { injectable } from 'inversify';
import { HttpService } from "../../../../../core/http/services/http.service";
import { env } from "../../../../../core/shared/env";

function isEmptyBody(response: Response): boolean {
  return response.status === 204 || response.headers.get("Content-Length") === "0";
}

function hasJsonContentType(response: Response): boolean {
  const contentType = response.headers.get("Content-Type");
  return contentType !== null && contentType.includes("application/json");
}

@injectable()
class HttpServiceImpl implements HttpService {
  async get<T>(path: string): Promise<T> {
    const url = `${env.API_URL}${path}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }
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
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }
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
    const url = `${env.API_URL}${path}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }
      if (isEmptyBody(response) || !hasJsonContentType(response)) {
        return undefined as T;
      }
      return response.json();
    } catch (error) {
      console.error(`Failed to send POST request to ${url}`, error);
      throw error;
    }
  }

  async patch<I, T>(path: string, data: I): Promise<T> {
    const url = `${env.API_URL}${path}`;
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }
      if (isEmptyBody(response) || !hasJsonContentType(response)) {
        return undefined as T;
      }
      return response.json();
    } catch (error) {
      console.error(`Failed to send PATCH request to ${url}`, error);
      throw error;
    }
  }
}

export { HttpServiceImpl };
