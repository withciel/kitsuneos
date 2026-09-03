export function singularize(name: string): string {
  if (name.endsWith('ies') && name.length > 3) {
    return `${name.slice(0, -3)}y`;
  }
  if (name.endsWith('s') && !name.endsWith('ss') && name.length > 1) {
    return name.slice(0, -1);
  }
  return name;
}

export function pascalCase(name: string): string {
  if (!name) {
    return name;
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function typeNameForCollection(collection: string): string {
  return pascalCase(singularize(collection));
}

export function relationObjectFieldName(fieldName: string): string {
  return fieldName.endsWith('_id')
    ? fieldName.slice(0, -3)
    : `${fieldName}_record`;
}
