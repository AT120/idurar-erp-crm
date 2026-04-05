import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const retries = 3;
const sleepX = 1.5;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class HttpClient {

  async post(url, data, config = {}) {
    return this.do('POST', url, data, config);
  }

  async get(url, config = {}) {
    return this.do('GET', url, undefined, config);
  }

  async put(url, data, config = {}) {
    return this.do('PUT', url, data, config);
  }

  async delete(url, config = {}) {
    return this.do('DELETE', url, undefined, config);
  }

  async patch(url, data, config = {}) {
    return this.do('PATCH', url, data, config);
  }

  async do(method, url, data, config = {}) {
    let lastError;
    config.headers = config.headers || {};
    config.headers['Idempotency-Key'] = uuidv4();

    for (let i = 0; i < retries + 1; i++) {
      try {
        const result = await axios.request({
          method,
          url,
          data,
          ...config,
          headers: config.headers,
        });

        if (result.status >= 200 && result.status < 500) {
          return result;
        }

      } catch (error) {
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }
        lastError = error;
        if (i !== retries) {
          await sleep(2000 * sleepX * (i + 1));
        }
      }
    }

    throw lastError;
  }
}

export default new HttpClient();
