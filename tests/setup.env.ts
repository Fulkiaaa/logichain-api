/**
 * Variables d'environnement minimales pour les tests unitaires.
 *
 * `src/config/env.ts` valide la configuration au chargement (fail-fast) : sans
 * ces valeurs, tout test important un module qui dépend de `env` échouerait au
 * import. On n'écrase jamais une variable déjà définie (`??=`) afin qu'un `.env`
 * local ou une CI puisse toujours imposer la sienne.
 */
process.env.NODE_ENV = 'test';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/logichain-test';
process.env.JWT_SECRET ??= 'secret-de-test-de-plus-de-32-caracteres';
// 4 tours au lieu de 12 : bcrypt reste sûr en prod, mais rapide en test.
process.env.BCRYPT_ROUNDS ??= '4';
