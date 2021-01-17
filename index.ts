import fs from 'fs'
import http from 'http'
import https from 'https'
import axios from 'axios'
import { compile } from 'ejs'
import { create as createRandom } from 'random-seed'
import { mod10 } from 'checkdigit'

const key = fs.readFileSync('lbs_key', 'utf-8')
const template = compile(fs.readFileSync('index.ejs', 'utf-8'))
if (!fs.existsSync('config.json')) fs.writeFileSync('config.json', '{}')

let config: Record<string, {
  token: string
  name: string
  password: string
  location: string
}> = JSON.parse(fs.readFileSync('config.json', 'utf-8'))

let lastTry = ''
let status: Record<string, string> = {}

const getIMEI = (mobile: string) => {
  const rand = createRandom(mobile)
  const str = '86' + rand.range(999999).toString().padStart(6, '0') + rand.range(999999).toString().padStart(6, '0')
  return str + mod10.create(str)
}

const padStart = (str: number) => str.toString().padStart(2, '0')
const getBody = <T> (req: http.IncomingMessage, cb: (err: Error | null, ret?: T) => void) => {
  const arr: Buffer[] = []
  req.on('error', cb).on('data', chunk => arr.push(chunk)).on('end', () => {
    try { cb(null, JSON.parse(Buffer.concat(arr).toString())) } catch (e) { cb(e) }
  })
}

const UA = 'Mozilla/5.0 (Linux; Android 10; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/85.0.4183.127 Mobile Safari/537.36 yiban_android'
const getToken = (mobile: string, password: string) => axios.get('https://mobile.yiban.cn/api/v3/passport/login', {
  timeout: 10000,
  params: { mobile, password, imei: getIMEI(mobile), ct: 1, identify: 0 },
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': UA,
    Origin: 'http://mobile.yiban.cn',
    Referer: 'http://mobile.yiban.cn'
  }
}).then(({ data }) => {
  if (data.response !== 100 || !data.data.user.access_token) throw new Error('登录-' + data.message)
  return data.data.user.access_token as string
})

const save = () => fs.promises.writeFile('config.json', JSON.stringify(config, null, 2))

const upload = async (mobile: string) => {
  const user = config[mobile]
  if (status[user.name] === '打卡成功!') return
  if (!user.password) throw new Error('没有填写密码!')
  try {
    const it = await axios.get('http://f.yiban.cn/iapp610661', {
      timeout: 30000,
      params: { access_token: user.token },
      headers: {
        Origin: 'https://f.yiban.cn',
        'User-Agent': UA
      }
    })
    if (it.status !== 200) throw new Error(it.statusText)
    const cookies = it.headers['set-cookie']
    const { data } = await axios.post(`http://yiban.sust.edu.cn/v4/public/index.php/Index/formflow/add.html`,
      encodeURI(`13[0][0][name]=form[13][field_1587635120_1722][]&13[0][0][value]=36.4&13[0][1][name]=form[13][field_1587635142_8919][]&13[0][1][value]=正常&13[0][2][name]=form[13][field_1587635252_7450][]&13[0][2][value]=${user.location}+&13[0][3][name]=form[13][field_1587635509_7740][]&13[0][3][value]=否&13[0][4][name]=form[13][field_1587998920_6988][]&13[0][4][value]=&13[0][5][name]=form[13][field_1587998777_8524][]&13[0][5][value]=否&13[0][6][name]=form[13][field_1587635441_3730][]&13[0][6][value]=`),
      {
        timeout: 30000,
        params: { desgin_id: '13', list_id: '9' },
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://yiban.sust.edu.cn',
          Referer: 'http://yiban.sust.edu.cn/v4/public/index.php/index/formtime/form.html?desgin_id=13&list_id=9',
          Cookie: (Array.isArray(cookies) ? cookies : [cookies]).join('').replace('; path=/; domain=.sust.edu.cn', '')
        }
      }
    )
    if (typeof data === 'string') {
      if (data.includes('网关')) throw new Error('网关错误!')
      if (data.includes('易班账号验证失败')) {
        const token = await getToken(mobile, user.password)
        user.token = token
        await save()
        await upload(mobile)
        return
      }
    }
    if (!data.msg) {
      console.error(data)
      throw new Error('返回错误!')
    }
    if (data.msg.includes('多次提交')) {
      status[user.name] = '打卡成功!'
      return
    }
    if (data.msg !== 'SU') throw new Error(data.msg)
    console.log(user.name + ':', '打卡成功!')
    status[user.name] = '打卡成功!'
  } catch (e) {
    console.error(user.name + ':', e)
    status[user.name] = `打卡失败! (${e.message})`
  }
}

const f = () => Promise.all(Object.keys(config).map(upload)).finally(() => {
  const t = new Date()
  lastTry = `${t.getFullYear()}-${padStart(t.getMonth() + 1)}-${padStart(t.getDay() + 1)} ${padStart(t.getHours())}:${padStart(t.getMinutes())}:${padStart(t.getSeconds())}`
})

setInterval(() => {
  switch (new Date().getHours()) {
    case 8:
      status = {}
      break
    case 9:
    case 10:
    case 11:
    case 12:
    case 13:
    case 14:
      f()
  }
}, 15 * 60 * 1000)
const hour = new Date().getHours()
if (hour > 8 && hour < 15) f()
console.log(config)

https.createServer({
  key: fs.readFileSync('ssl.key'),
  cert: fs.existsSync('ssl.pem') ? fs.readFileSync('ssl.pem') : fs.readFileSync('ssl.crt')
}, (req, res) => {
  switch (req.url) {
    case '/':
      if (req.method !== 'GET') break
      res.end(template({ key, lastTry, status }))
      return
    case '/update':
      if (req.method !== 'POST') break
      getBody<{ username: string, password: string, location: string }>(req, (err, data) => {
        if (err) {
          console.error(err)
          res.end('发生错误!')
          return
        }
        const { username, password, location } = data!
        if (!username || !password || !location || typeof username !== 'string' || typeof password !== 'string' || typeof location !== 'string') {
          res.end('提交数据错误!')
          return
        }
        if (!(username in config)) {
          res.end('你不是白名单用户!')
          return
        }
        getToken(username, password).then(token => {
          const user = config[username]
          user.token = token
          user.password = password
          user.location = location.trim().replace(/ /g, '+')
          return save()
        }).then(() => res.end('保存成功!'), e => {
          console.error(e)
          res.end('发生错误!')
        })
      })
      return
  }
  res.statusCode = 404
  res.end()
}).listen(2333, () => console.log('Started!'))
