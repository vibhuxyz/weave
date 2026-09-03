# notes-api (spec)

A minimal notes service.

    POST   /notes        { title, body } -> 201, the created note incl. id
    GET    /notes         -> 200, an array of all notes
    GET    /notes/:id     -> 200 the note, or 404 if it does not exist
    GET    /health        -> 200 { "ok": true }

No database required — in-memory is fine. `npm start` must boot it, reading
the port from `process.env.PORT`.
