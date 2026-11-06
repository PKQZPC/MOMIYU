const fs=require('node:fs');
const path=require('node:path');

function projectDirectory(root,directory) {
  const base=fs.realpathSync(root),target=path.resolve(directory),relative=path.relative(base,target);
  if (!relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) throw new Error('data_path_outside_project');
  let current=base;
  for (const segment of relative.split(path.sep)) {
    current=path.join(current,segment);
    if (fs.existsSync(current)) {
      const stat=fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe_data_directory');
    } else fs.mkdirSync(current);
  }
  return target;
}
function configurePaths(app,root,{smoke=false,dataDirectory}={}) {
  const base=projectDirectory(root,path.join(root,'.local/desktop'));
  const profile=projectDirectory(root,smoke ? path.join(base,'smoke-data') : dataDirectory || path.join(base,'profiles/default'));
  const paths={appData:projectDirectory(root,path.join(base,'app-data')),userData:profile,
    sessionData:projectDirectory(root,path.join(profile,'session')),
    temp:projectDirectory(root,path.join(profile,'tmp')),
    crashDumps:projectDirectory(root,path.join(profile,'crashes')),
    logs:projectDirectory(root,path.join(profile,'logs'))};
  for (const [key,value] of Object.entries(paths)) app.setPath(key,value);
  app.setAppLogsPath(paths.logs);
  app.commandLine.appendSwitch('disk-cache-dir',projectDirectory(root,path.join(paths.sessionData,'cache')));
  process.env.TEMP=paths.temp;process.env.TMP=paths.temp;
  return paths;
}
module.exports={projectDirectory,configurePaths};
