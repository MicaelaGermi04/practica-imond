// CSV con encabezados, campos entre comillas, comillas escapadas y saltos internos.
export function parseCSV(source) {
  const text = source.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const finishField = () => { row.push(field); field = ''; closed = false; };
  const finishRow = () => {
    finishField();
    if (row.some(value => value !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',') finishField();
    else if (char === '\n' || char === '\r') {
      finishRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error('CSV inválido: comillas mal ubicadas.');
      field += char;
    }
  }
  if (quoted) throw new Error('CSV inválido: campo con comillas sin cerrar.');
  if (field !== '' || row.length || closed) finishRow();
  if (!rows.length) throw new Error('El CSV está vacío y no contiene encabezados.');
  const headers = rows.shift().map(value => value.trim());
  if (headers.some(value => !value) || new Set(headers).size !== headers.length) {
    throw new Error('Encabezados vacíos o duplicados.');
  }
  return {
    headers,
    rows: rows.map((values, index) => {
      if (values.length !== headers.length) throw new Error(`Registro ${index + 2}: cantidad de columnas incorrecta.`);
      return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
    }),
  };
}
