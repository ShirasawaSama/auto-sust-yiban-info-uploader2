# auto-sust-yiban-info-uploader2

## Requirement

- Nodejs
- SSL Certificates
- 腾讯位置服务 Key

## Usage

### Build

```bash
git clone https://github.com/ShirasawaSama/auto-sust-yiban-info-uploader2.git

cd auto-sust-yiban-info-uploader2

npm install

echo 你的腾讯位置服务Key>lbs_key
```

Then rename your SSL certificate files to `ssl.key` and `ssl.pem` (or `ssl.crt`).

### Run

```bash
npm start
```

### Whitelist

Edit config.json:

```json
{
  "账号1": {
    "name": "名字1"
  },
  "账号2": {
    "name": "名字2"
  }
}
```

Then restart the application.

### Login Information

Open: https://127.0.0.1:2333/

## Author

Shirasawa

## License

[MIT](./LICENSE)
