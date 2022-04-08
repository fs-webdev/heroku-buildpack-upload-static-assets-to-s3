const path = require('path');
const fs = require('fs');
const deps = require(path.join(__dirname, '../deps.json'));

const output = {
  name: deps.name,
  version: deps.version
}

const recursiveSearch = (obj, searchKey, results = []) => {
  const r = results;
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    console.log('key:', key)
    // push package version
    if (key !== searchKey && typeof value === 'object' && value.hasOwnProperty('version')) {
      r.push({ name: key, version: value.version });
    }
    // recurse into deps
    if (key === searchKey && typeof value === 'object') {
      recursiveSearch(value, searchKey, r);
    }
    // recurse into sub-deps
    if (typeof value === 'object' && value.hasOwnProperty(searchKey)) {
      recursiveSearch(value[searchKey], searchKey, r);
    }
  });
  return r;
};

const flatDeps = recursiveSearch(deps, 'dependencies');
console.log(flatDeps.length);

output.dependencies = flatDeps

fs.writeFileSync(path.join(__dirname, '../deps.json.flat'), JSON.stringify(output, null, 2));