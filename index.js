const fs = require('fs')
const path = require('path')
const axios = require('./speed-limiter')
const cheerio = require('cheerio')

const bookID = '9781975190620/'
const baseURL = `https://jigsaw.vitalsource.com/books/$9781975190620/epub/`
const fsRelativePath = './epub/'

// Cookie value sent to jigsaw.vitalsource.com from the browser
// including: reese84 + jigsaw_session
const globalCookieVal = `b52KbkUXq7ruh60Yke9q21hskUHX6GzFejprTSQ8D5Q77t%2FM0mG4ZTELxQKTEe8K6q2oZyOuIOWJufBnwy09iQ4Mvzc8hp7PZQy0OFPPmKBM2z%2FuQ6yvB60zEShsKk5MN5iWUtk%2FhUiBPLgG0hWTMZSJAybsfrh%2FgAapvrQDch6a7xhmmspf%2BfAJVFSC7g7eiEvFWcZGhguxSf6p%2F7tzOh3NRP6ZZq0WUYqBxzbcGrYziuRgZJFei0zvg6Tc1mSXuUfVfXbHTGopLFiHmeYVSdPDjSW0YRKND9fICu05iw%3D%3D--1KCtPpkf6XmsoWPX--karS0gPqpAtEBO%2Fy7g%2BEYQ%3D%3D`

const writeIntoFS = async (filepath, contents) => {
  const file = path.resolve(fsRelativePath, filepath)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, contents)
  return file
}

const fetchXML = async epubPath => {
  const furl = baseURL + epubPath
  console.log(`Fetching ${furl}`)
  const { data } = await axios.request({
    url: furl,
    method: 'get',
    transformResponse: [d => d],
    responseType: 'text',
    headers: { Cookie: globalCookieVal }
  })
  const $ = cheerio.load(data)
  return { data: `<?xml version="1.0" encoding="UTF-8"?>` + data, $ }
}

const fetchURL = async epubPath => {
  const furl = baseURL + epubPath
  console.log(`Fetching ${furl}`)
  const { data } = await axios.request({
    url: furl,
    method: 'get',
    transformResponse: [d => d],
    responseType: 'arraybuffer',
    headers: { Cookie: globalCookieVal }
  })
  return data
}

// Specific Fetchers/extractors
const getContainer = async () => {
  const url = 'META-INF/container.xml'
  let packageOPF
  await fetchXML(url).then(async ({ data, $ }) => {
    packageOPF = $('rootfile').attr('full-path')
    if (!fs.existsSync(path.resolve(fsRelativePath, url))) {
      await writeIntoFS(url, Buffer.from(data, 'utf8'))
    }
  })
  return packageOPF
}

const getOPF = async () => {
  const url = 'OEBPS/package.opf' // big one
  let looperURLs = []
  await fetchXML(url).then(async ({ data, $ }) => {
    $('manifest [href]').each((i, el) => {
      const fip = 'OEBPS/' + $(el).attr('href')
      if (!fs.existsSync(path.resolve(fsRelativePath, fip))) looperURLs.push(fip)
    })

    if (!fs.existsSync(path.resolve(fsRelativePath, url))) {
      await writeIntoFS(url, Buffer.from(data, 'utf8'))
    }
  })
  return looperURLs
}

let completed = 0
let totalToRun = 0

const getAndSave = async (url) => {
  await fetchURL(url).then(async data => {
    await writeIntoFS(url, Buffer.from(data, 'binary'))
    completed += 1
    console.log(`${(completed / totalToRun * 100).toFixed(2)}%\t Saved ${url}`)
  })
  return true
}

const recursiveGet = async (arrayURLs) => {
  totalToRun = arrayURLs.length
  for (let i = 0; i < arrayURLs.length; i += 1) {
    getAndSave(arrayURLs[i])
  }
  return true
}

getContainer().then(getOPF).then(recursiveGet)
