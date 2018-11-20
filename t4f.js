const fs = require('fs');
const puppeteer = require('puppeteer');
const request = require('request-promise');
const csv = require('csvtojson');
const readline = require('readline');
const { google } = require('googleapis');
const CronJob = require('cron').CronJob;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';

const defaultViewport = {
    deviceScaleFactor: 1,
    hasTouch: false,
    height: 1024,
    isLandscape: false,
    isMobile: false,
    width: 1280
};

const clickAndWait = async (page, selector, duration = 500) => {
    await page.click(selector)
    if (duration === 0) {
        await page.waitForNavigation();
    } else {
        await page.waitFor(duration)
    }
};

const sleepBot = async (page, duration = 500) => {
    await page.evaluate(async (duration) => {
        await new Promise(function (resolve) {
            setTimeout(resolve, duration);
        });
    }, duration);
};

const file = fs.readFileSync('t4f.config');
const line = file.toString('utf8').split('\n');

const sheetId = line[0].split(/=(.+)/)[1];
const timeExecute = line[1].split(/=(.+)/)[1];
let browser;
let isRunning = false;

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Sheets API.


    // const job = new CronJob(
    //     {
    //         cronTime: timeExecute,
    //         onTick: function () {

    //             if (!isRunning) {
    //                 isRunning = true;

    //                 setTimeout(function () {
    //                     authorize(JSON.parse(content), listMajors);
    //                     isRunning = false;
    //                 }, 3000);
    //             }

    //         }
    //     })
    // job.start();

    setTimeout(function () {
        authorize(JSON.parse(content), listMajors);
        isRunning = false;
    }, 3000);

});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}


/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
function listMajors(auth) {
    const sheets = google.sheets({ version: 'v4', auth });

    sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'parametros',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        const rows = res.data.values;
        let index = 2;
        if (rows.length) {
            rows.shift();

            try {
                (async () => {
                    for (const row of rows) {
                        console.log('Processando linha ' + (index - 1))
                        const params = {
                            portal: row[0],
                            usuario: row[1],
                            senha: row[2],
                            evento: row[3],
                            local_evento: row[4],
                            tipo_venda: row[5],
                            data_evento: row[6],
                            categoria: row[7],
                            quantidade: row[8],
                            cartao_numero: row[9],
                            cartao_nome: row[10],
                            cartao_expira_mes: row[11],
                            cartao_expira_ano: row[12],
                            cartao_cvc: row[13]
                        };

                        try {

                            browser = await puppeteer.launch({
                                headless: false, // launch headful mode
                                slowMo: 0, // slow down puppeteer script so that it's easier to follow visually
                                devtools: false,
                                ignoreHTTPSErrors: true,
                                args: [
                                    '--no-sandbox',
                                    '--disable-setuid-sandbox',
                                    '--proxy-server="direct://"',
                                    '--proxy-bypass-list=*',
                                    '--disable-web-security',
                                    '--lang=pt-BR,pt'
                                ]
                            });

                            try {
                                const page = await browser.newPage();
                                await page.setViewport(defaultViewport);
                                await page.goto(params.portal, {
                                    timeout: 0
                                });

                                await page.type('#ctl00_ctl00_uiBodyMain_uiBodyMain_uiLogin_tbLoginCode', params.usuario)
                                await page.type('#ctl00_ctl00_uiBodyMain_uiBodyMain_uiLogin_tbPassword', params.senha)
                                await clickAndWait(page, '#ctl00_ctl00_uiBodyMain_uiBodyMain_uiLogin_ibLogin', 0)

                                await page.type('#ctl00_uiEventSelector_k', params.evento)
                                await page.keyboard.press('Enter')

                                await page.waitFor(5000)

                                await page.evaluate(async (params) => {

                                    document.querySelectorAll('.resultContainer').forEach(async item => {

                                        let evento = item.querySelector('.contentEvent h6');

                                        if (evento) {

                                            if (evento.textContent.toUpperCase() === params.evento) {

                                                document.querySelector('.resultBuyNow a').click()

                                            }
                                        }

                                    })

                                }, params)

                                await page.waitFor(3000)

                                await page.evaluate(async (params) => {

                                    document.querySelectorAll('.specialEventBlurb p').forEach(function (item) {

                                        if(item.textContent.toUpperCase().indexOf(params.local_evento.toUpperCase()) == 0) {

                                            item.parentElement.parentElement.querySelectorAll('.blue').forEach(function(x){
                                                                                                
                                                if(x.textContent.toUpperCase() === params.tipo_venda.toUpperCase()) {

                                                    document.location.href =  x.parentElement.parentElement.querySelector('a');

                                                }
                                            })

                                        }
                                    })

                                    await page.waitFor(3000)

                                    await 

                                    await page.clickAndWait(page, '#ctl00_ctl00_uiBodyMain_uiBodyRight_uiPerfSelector_uiBuyNowButton', 5000)


                                  
                                }, params)

                                // await page.waitFor(5000)

                                // await page.evaluate(async () => {

                                //     document.querySelector('#ctl00_ctl00_uiBodyMain_uiBodyRight_uiPerfSelector_uiBuyNowButton').click()

                                // })


                                // await page.evaluate(async (params) => {

                                //     document.querySelectorAll('table#tableAssortmentList_yTix tbody>tr:not(.disabled)')
                                //         .forEach(async item => {

                                //             if (item.querySelector('td.single-rowspan.priceCategory').textContent.trim() == params.setor &&
                                //                 item.querySelector('td.single-rowspan.discountLevel').textContent.trim() == params.categoria) {

                                //                 let cboQuantidade = item.querySelector('select');

                                //                 if (item.querySelector('td.single-rowspan.priceCategory').textContent.trim().indexOf('MESA') > -1) {
                                //                     cboQuantidade.value = 4;
                                //                 } else {

                                //                     let arr = item.querySelectorAll('select option');
                                //                     let quantidade_maxima = arr[arr.length - 1].textContent;

                                //                     if (params.quantidade > quantidade_maxima) {
                                //                         cboQuantidade.value = quantidade_maxima;
                                //                     } else {
                                //                         cboQuantidade.value = params.quantidade;
                                //                     }

                                //                 }
                                //             }

                                //         });

                                // }, params);


                                // await clickAndWait(page, '#DetailB_ToShoppingCart_Button_' + params.id_categoria, 3000);
                                // await clickAndWait(page, '#shoppingCartToNextPageBtn', 5000);
                                // await clickAndWait(page, '#deliveryToPaymentBtn', 3000);

                                // await page.evaluate(async () => {

                                //     document.querySelector('#paymentId372Toggle > div.row.accordion-description-box > div > div.accordion-description-headline > div > span').click();

                                // });

                                // await clickAndWait(page, '#paymentToSummaryBtn', 0);

                                // await page.evaluate(() => {
                                //     document.querySelector('#summaryPage > div:nth-child(1) > div > div.ng-scope > div.card.standard-gray-shadow.theme-element-radius.theme-content-bg.theme-text-color.form.row > div > div > ev-terms-and-conditions > section > div.checkbox > ev-option-box > div > label').click();
                                // });

                                // await page.waitFor(3000);

                                // await page.evaluate(() => {
                                //     document.querySelector('#summaryPage > div:nth-child(2) > div.col-xs-12.col-md-7 > div > div > div > div:nth-child(3) > section > button').click();
                                // });

                                // await page.waitFor(5000);

                                // await page.evaluate(async (params) => {

                                //     document.getElementById('card.cardNumber').value = params.cartao_numero;
                                //     document.getElementById('card.cardHolderName').value = params.cartao_nome;
                                //     document.getElementById('card.cvcCode').value = params.cartao_cvc;
                                //     document.getElementById('card.expiryMonth').value = params.cartao_expira_mes;
                                //     document.getElementById('card.expiryYear').value = params.cartao_expira_ano;

                                //     document.querySelector('input.paySubmit').click();

                                // }, params);

                                index++;

                            } catch (err) {
                                console.error(err)
                                index++;
                                //await browser.close()
                            }

                        } catch (err) {
                            console.error(err)
                        }
                    }
                })();
            } catch (err) {
                console.error(err)
            }
        } else {
            console.log('No data found.');
        }
    });
}