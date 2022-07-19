var areScriptsAdded = false;

function concatUrls(base, rest) {
    base = base.trim();
    rest = rest.trim();
    if (base.substr(base.length - 1) == '/') base = base.substr(0, base.length - 1);
    if (rest.substr(0, 1) == '/') rest = rest.substr(1);
    return `${base}/${rest}`
}

const addJsLink = (jsUrl) => {
    const head = document.getElementsByTagName('head')[0];
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = jsUrl;
    script.async = false;
    head.appendChild(script);
};

const addCssLink = (cssUrl) => {
    const head = document.getElementsByTagName('head')[0];
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = cssUrl;
    head.appendChild(link);
};

const addDesignerAndViewerJSandCssLinks = (portalUrl, pluginVersion, theme) => {
    const themeSuffix = theme !== 'default' ? `.${theme}` : '';
    const viewerCssUrl = concatUrls(portalUrl, `api/pluginassets/reports-${pluginVersion}/viewer-app${themeSuffix}.css`);
    const designerCssUrl = concatUrls(portalUrl, `api/pluginassets/reports-${pluginVersion}/designer-app.css`);

    const viewerJsUrl = concatUrls(portalUrl, `api/pluginassets/reports-${pluginVersion}/viewer-app.js`);
    const designerJsUrl = concatUrls(portalUrl, `api/pluginassets/reports-${pluginVersion}/designer-app.js`);

    addJsLink(viewerJsUrl);
    addJsLink(designerJsUrl);
    addCssLink(viewerCssUrl);
    addCssLink(designerCssUrl);
};

const defaultHeaders = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Accept: 'application/json',
    'content-type': 'application/json',
    'pragma': 'no-cache',
};

const makeHeaders = (referenceToken) => ({ ...defaultHeaders, 'Reference-Token': referenceToken });

const postGraphQlRequest = async (portalUrl, referenceToken, requestPayload) => {
    const url = concatUrls(portalUrl, 'api/graphql');
    const init = {
        headers: makeHeaders(referenceToken),
        method: 'post',
        body: JSON.stringify(requestPayload),
    };

    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`${url} status code ${response.status}`);

    const result = await response.json();
    return result;
};

const getReportingInfo = async (portalUrl, referenceToken) => {
    const result = await postGraphQlRequest(portalUrl, referenceToken, {
        query: 'query { me { language, themeName }, reportingInfo { version } }',
    });
    const { data: { me: { language, themeName }, reportingInfo: { version } } } = result;
    return {
        pluginVersion: version,
        theme: themeName,
        locale: language,
    };
};

async function getReferenceToken(url, user, password) {
    const endpoint = concatUrls(url, 'connect/token')
    const resolveResponse = async (response) => {
        const jsonResponse = await response.json();
        if (jsonResponse.error) return null;
        return jsonResponse.access_token;
    }

    return await fetch(endpoint, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*',
        },
        method: 'post',
        body: `grant_type=password&username=${user}&password=${password}&client_id=integration&client_secret=eunGKas3Pqd6FMwx9eUpdS7xmz`,
    }).then(async response => {
        let res = await resolveResponse(response)
        return res;
    }).catch(error => {
        alert(error);
        return null;
    });
}

async function getReportList(portalUrl, referenceToken) {
    const url = concatUrls(portalUrl, 'api/graphql')
    const init = {
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Accept: 'application/json',
            'content-type': 'application/json',
            'pragma': 'no-cache',
            'Reference-Token': referenceToken
        },
        method: 'post',
        body: JSON.stringify({ query: 'query { documenttypes(key:"rdl") { documents{ id, title } } }' })
    };
    const res = await fetch(url, init);
    if (!res.ok) return null
    let response = await res.json()
    let documents = response.data.documenttypes[0].documents;
    let list = documents.map(x => ({ name: x.title, id: x.id }))
    list.sort((x, y) => x.name < y.name ? -1 : 1)
    return list
}

function createSignInForm() {
    const signInForm = {
        open: () => {
            document.getElementById('sign-in-root').classList.remove('not-displayed');
            document.getElementById('app-root').classList.add('not-displayed');
            document.getElementById("sign-in-username").focus();
        },
        close: () => { document.getElementById('sign-in-root').classList.add('not-displayed') },
        onSignIn: null
    }
    const signInButton = document.getElementById('sign-in-button');
    const signInAction = async () => {
        signInButton.disabled = true;
        let portalUrl = document.getElementById('sign-in-portal-url').value;
        let username = document.getElementById('sign-in-username').value;
        let password = document.getElementById('sign-in-password').value;
        try {
            await signInForm.onSignIn(portalUrl, username, password);
            document.getElementById('sign-in-error').innerHTML = null;
            document.getElementById('app-root').classList.remove('not-displayed');
        }
        catch (err) {
            document.getElementById('sign-in-error').innerHTML = err.message;
        }
        finally {
            signInButton.disabled = false;
        }
    };
    signInButton.onclick = signInAction;
    document.getElementById('sign-in-root').addEventListener("keyup", (event) => {
        if (event.keyCode === 13)
            signInAction()
    });
    return signInForm
}

const createAppSidebar = (portalUrl, username, referenceToken) => {
    document.getElementById('app-portal-url').innerHTML = (
        `<a href="${portalUrl}" target="_blank" rel="noopener noreferrer">${portalUrl}</a>`
    );
    document.getElementById('app-username').innerHTML = username;
    const reportsList = document.getElementById('wyn-report-list');
    let reports = [];

    const sortReports = () => {
        reports = reports.sort((x, y) => x.name.localeCompare(y.name));
    };
    const removeActiveReport = () => {
        const items = reportsList.children;
        for (let i = 0; i < items.length; i++) {
            items[i].classList.remove('active');
        }
    };

    const createReportElement = (report) => {
        const item = document.createElement('li');
        item.value = report.id;
        const text = document.createElement('span');
        text.innerHTML = report.name;
        item.title = report.name;
        item.appendChild(text);
        item.className = 'wyn-report-list-item';
        item.onclick = () => {
            removeActiveReport();
            item.classList.add('active');
            appSidebar.onOpenReport(report);
        };
        return item;
    };
    const appSidebar = {
        onLogOut: null,
        onCreateReport: null,
        onReportInDesigner: null,
        onReportInViewer: null,
        onOpenReport: null,
        refreshReportsList: async () => {
            reports = await getReportList(portalUrl, referenceToken);
            sortReports();
            reportsList.innerHTML = '';
            reports.forEach(report => {
                const item = createReportElement(report);
                reportsList.appendChild(item);
            });
        },
        onSavedReport: (report) => {
            let index = reports.findIndex(x => report.id === x.id || report.name === x.name);
            if (index === -1) {
                reports.push(report);
                sortReports();
                index = reports.findIndex(x => report.id === x.id);
                const item = createReportElement(report);
                reportsList.insertBefore(item, reportsList.children[index]);
            }
            removeActiveReport();
            const item = reportsList.children[index];
            item.classList.add('active');
        },
        clearReportList: () => {
            reports = [];
            reportsList.innerHTML = '';
        },
    };
    document.getElementById('app-create-rdl-report').onclick = () => {
        removeActiveReport();
        appSidebar.onCreateReport('CPL');
    };
    document.getElementById('app-create-page-report').onclick = () => {
        removeActiveReport();
        appSidebar.onCreateReport('FPL');
    };
    document.getElementById('app-open-report-designer').onclick = () => {
        removeActiveReport();
        appSidebar.onReportInDesigner();
    };
    document.getElementById('app-logout-button').onclick = () => { appSidebar.onLogOut(); };

    return appSidebar;
};

const createViewer = async (portalUrl, referenceToken, username) => {
    const prevDocumentTitle = document.title;

    const reportViewerAppId = 'report-viewer-app';
    let viewer = window.GrapeCity.WynReports.Viewer.create({
        element: reportViewerAppId,
        portalUrl,
        referenceToken,
        locale: 'en',
        makeTitle: (reportName) => reportName,
    });
    return {
        openReport: async (report) => {
            await viewer.openReport(report.id);
            document.getElementById(reportViewerAppId).classList.remove('not-displayed');
        },
        close: () => {
            if (viewer) {
                viewer.destroy();
                viewer = null;
            }
            document.getElementById(reportViewerAppId).classList.add('not-displayed');
            document.title = prevDocumentTitle;
        },
    };
}

const createDesigner = async (portalUrl, referenceToken, onSavedReport) => {
    const prevDocumentTitle = document.title;

    const designerOptions = window.GrapeCity.WynReports.Designer.createDesignerOptions(portalUrl, referenceToken);
    designerOptions.locale = 'en';
    designerOptions.onSaved = onSavedReport;

    designerOptions.makeTitle = (reportName, options) => {
        const title = `${reportName}${options.dirty ? ' *' : ''}`;
        return title;
    };

    let viewer = null;
    designerOptions.openViewer = (options) => {
        if (!viewer) {
            viewer = window.GrapeCity.WynReports.Viewer.create({
                element: options.element,
                portalUrl,
                referenceToken,
                locale: options.locale,
            });
        }

        viewer.openReport(options.reportInfo.id);
    };

    await window.GrapeCity.WynReports.Designer.renderApplication('report-designer-app', designerOptions);
    const reportDesignerApp = document.getElementById('report-designer-app');

    return {
        createReport: (reportType) => {
            window.GrapeCity.WynReports.Designer.closeViewer();
            window.GrapeCity.WynReports.Designer.api.createReport({
                reportType: (reportType || '').toUpperCase() === 'FPL' ? 'FPL' : 'CPL',
            });
            reportDesignerApp.classList.remove('not-displayed');
        },
        openReportInDesigner: (report) => {
            window.GrapeCity.WynReports.Designer.closeViewer();
            const reportInfo = {
                id: report.id,
                name: report.name,
                permissions: ['all'],
            };
            window.GrapeCity.WynReports.Designer.api.openReport({ reportInfo });
            reportDesignerApp.classList.remove('not-displayed');
        },
        openReport: (report) => {
            window.GrapeCity.WynReports.Designer.closeViewer();
            const reportInfo = {
                id: report.id,
                name: report.name,
                permissions: ['all'],
            };
            window.GrapeCity.WynReports.Designer.api.openReport({ reportInfo });
            reportDesignerApp.classList.remove('not-displayed');
        },
        close: () => {
            if (viewer) {
                viewer.destroy();
                viewer = null;
            }
            window.GrapeCity.WynReports.Designer.destroy();
            reportDesignerApp.classList.add('not-displayed');
            document.title = prevDocumentTitle;
        },
    };
};

const showApp = function () {
    document.getElementById('app-root').classList.remove('not-displayed');
    setTimeout(() => {
        document.getElementById('app-designer-instructions').classList.remove('not-displayed');
    }, 50);
}

function init() {
    const signInForm = createSignInForm();
    signInForm.onSignIn = async (portalUrl, username, password) => {
        const referenceToken = await getReferenceToken(portalUrl, username, password)
        if (!referenceToken)
            throw new Error('Invalid user name or password.')

        if (!areScriptsAdded) {
            const info = await getReportingInfo(portalUrl, referenceToken);
            await addDesignerAndViewerJSandCssLinks(portalUrl, info.pluginVersion, info.theme);
            areScriptsAdded = true;
        }

        setTimeout(async () => {
            var rpt = null;
            const appSidebar = await createAppSidebar(portalUrl, username, referenceToken);
            const viewer = await createViewer(portalUrl, referenceToken, username);
            const designer = await createDesigner(portalUrl, referenceToken, appSidebar.onSavedReport);

            appSidebar.onCreateReport = (reportType) => {
                designer.createReport(reportType);
                document.getElementById('report-viewer-app').classList.add('not-displayed');
            };
            appSidebar.onOpenReport = async (report) => {
                rpt = report;
                viewer.openReport(report);
                document.getElementById('report-designer-app').classList.add('not-displayed');
            };
            appSidebar.onReportInDesigner = async (report) => {
                designer.openReportInDesigner(rpt);
                document.getElementById('report-viewer-app').classList.add('not-displayed');
            }
            await appSidebar.refreshReportsList();
            showApp();

            appSidebar.onLogOut = () => {
                signInForm.open();
                viewer.close();
                designer.close();
            }
            signInForm.close();
        }, 100);
    }
    signInForm.open();
}