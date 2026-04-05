import axios from 'axios';


const retries = 3;
const sleepX = 1.5

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class HttpClient {

  // implement retries
  async post(...args) {
    return await this.do(axios.post, ...args)
  }

  async get(...args) {
    return await this.do(axios.get, ...args)
  }

  async put(...args) {
    return await this.do(axios.put, ...args)
  }

  async delete(...args) {
    return await this.do(axios.delete, ...args)
  }

  async patch(...args) {
    return await this.do(axios.patch, ...args)
  }


  async do(axiosMethod, ...args) {
    let lastError
    for (let i = 0; i < retries + 1; i++) {
      try {
        const result = await axiosMethod(...args);
        if (result.status < 500 && result.status >= 200) {
          return result
        }

      } catch (error) {
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error
        }
        lastError = error
        if (i != retries) {
          await sleep(2000 * sleepX * (i + 1));
        }
      }
    }

    throw lastError
  }
}

export default new HttpClient()

