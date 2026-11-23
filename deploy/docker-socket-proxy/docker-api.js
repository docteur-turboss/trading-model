// njs filters of the Docker API proxy (nginx.conf, issue #2409).
const PROJECT_LABEL = 'com.docker.compose.project';
const project = process.env.COMPOSE_PROJECT_NAME || '';
const projectFilter = `${PROJECT_LABEL}=${project}`;

function inProject(info) {
    const labels = info && info.Config && info.Config.Labels;
    return project !== '' && labels != null && labels[PROJECT_LABEL] === project;
}

async function readInspect(r) {
    const reply = await r.subrequest(
        `/_docker${r.variables.api || ''}/containers/${r.variables.cid}/json`,
    );
    if (reply.status !== 200) return null;
    try {
        return JSON.parse(reply.responseText);
    } catch (_) {
        return null;
    }
}

// GET /containers/{id}/json: project containers only, without Config.Env.
async function inspect(r) {
    const info = await readInspect(r);
    if (!inProject(info)) {
        r.return(403, '{"message":"forbidden by docker-socket-proxy"}\n');
        return;
    }
    delete info.Config.Env;
    r.headersOut['Content-Type'] = 'application/json';
    r.return(200, JSON.stringify(info));
}

// auth_request of GET /containers/{id}/logs ($cid is shared with the parent request).
async function authorize(r) {
    r.return(inProject(await readInspect(r)) ? 204 : 403);
}

// Query string of GET /containers/json: the caller's filters plus the project label
// (Docker ANDs label filters), so no other project's container is ever listed.
function listArgs(r) {
    let filters = {};
    try {
        filters = r.args.filters ? JSON.parse(r.args.filters) : {};
    } catch (_) {
        filters = {};
    }
    if (filters === null || typeof filters !== 'object' || Array.isArray(filters)) filters = {};
    const labels = filters.label;
    // Docker also accepts the legacy map form {"label": {"k=v": true}}.
    const list = Array.isArray(labels)
        ? labels.slice()
        : labels && typeof labels === 'object'
          ? Object.keys(labels)
          : [];
    list.push(projectFilter);
    filters.label = list;

    const parts = [`filters=${encodeURIComponent(JSON.stringify(filters))}`];
    ['all', 'limit', 'size'].forEach((key) => {
        const value = r.args[key];
        if (typeof value === 'string') parts.push(`${key}=${encodeURIComponent(value)}`);
    });
    return parts.join('&');
}

export default { inspect, authorize, listArgs };
