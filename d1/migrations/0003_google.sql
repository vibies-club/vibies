-- Private Better Auth shadow records. No Google profile or provider token is retained.
CREATE TABLE google_users (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=64 AND id NOT GLOB '*[^a-f0-9]*'),
 name TEXT NOT NULL CHECK(name='Member'),
 email TEXT NOT NULL UNIQUE CHECK(email=id || '@vibies.invalid'),
 emailVerified INTEGER NOT NULL CHECK(emailVerified=1),
 image TEXT CHECK(image IS NULL),
 createdAt TEXT NOT NULL,
 updatedAt TEXT NOT NULL
);
CREATE TABLE google_identity_map (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES google_users(id),
 github_id TEXT NOT NULL UNIQUE
);
CREATE TABLE google_sessions (
 id TEXT PRIMARY KEY NOT NULL,
 token TEXT NOT NULL UNIQUE,
 userId TEXT NOT NULL REFERENCES google_users(id),
 expiresAt TEXT NOT NULL,
 createdAt TEXT NOT NULL,
 updatedAt TEXT NOT NULL,
 ipAddress TEXT CHECK(ipAddress IS NULL),
 userAgent TEXT CHECK(userAgent IS NULL)
);
CREATE TABLE google_link_grants (
 grant_hash TEXT PRIMARY KEY NOT NULL CHECK(length(grant_hash)=64 AND grant_hash NOT GLOB '*[^a-f0-9]*'),
 user_id TEXT NOT NULL UNIQUE REFERENCES google_users(id),
 session_hash TEXT NOT NULL REFERENCES sessions(session_hash) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE google_accounts (
 id TEXT PRIMARY KEY NOT NULL,
 userId TEXT NOT NULL UNIQUE REFERENCES google_users(id),
 accountId TEXT NOT NULL UNIQUE CHECK(length(accountId) BETWEEN 1 AND 255),
 providerId TEXT NOT NULL CHECK(providerId='google'),
 accessToken TEXT CHECK(accessToken IS NULL),
 refreshToken TEXT CHECK(refreshToken IS NULL),
 idToken TEXT CHECK(idToken IS NULL),
 accessTokenExpiresAt INTEGER CHECK(accessTokenExpiresAt IS NULL),
 refreshTokenExpiresAt INTEGER CHECK(refreshTokenExpiresAt IS NULL),
 scope TEXT CHECK(scope IS NULL),
 password TEXT CHECK(password IS NULL),
 authorizationHash TEXT NOT NULL,
 createdAt TEXT NOT NULL,
 updatedAt TEXT NOT NULL
);
CREATE TABLE google_verifications (
 id TEXT PRIMARY KEY NOT NULL,
 identifier TEXT NOT NULL,
 value TEXT NOT NULL,
 expiresAt TEXT NOT NULL,
 createdAt TEXT NOT NULL,
 updatedAt TEXT NOT NULL
);
CREATE INDEX google_verification_identifier ON google_verifications(identifier);
-- The write and consumption share a SQLite statement, including under competing callbacks.
CREATE TRIGGER google_account_authorize BEFORE INSERT ON google_accounts BEGIN
 SELECT RAISE(ABORT,'google_link_forbidden') WHERE NOT EXISTS (
  SELECT 1 FROM google_link_grants g JOIN sessions s ON s.session_hash=g.session_hash
  JOIN google_identity_map m ON m.user_id=g.user_id AND m.github_id=s.github_id
  WHERE g.grant_hash=NEW.authorizationHash AND g.user_id=NEW.userId
   AND g.expires_at>unixepoch('now') AND s.auth_provider='github'
   AND julianday(s.created_at)>julianday('now','-5 minutes') AND julianday(s.created_at)<=julianday('now')
   AND (s.github_id=(SELECT instructor_github_id FROM community WHERE singleton=1)
    OR EXISTS(SELECT 1 FROM accounts a WHERE a.github_id=s.github_id AND a.status='approved'))
 );
END;
CREATE TRIGGER google_account_consume AFTER INSERT ON google_accounts BEGIN
 DELETE FROM google_link_grants WHERE grant_hash=NEW.authorizationHash;
 DELETE FROM google_sessions WHERE userId=NEW.userId;
END;
CREATE TRIGGER google_account_immutable BEFORE UPDATE ON google_accounts BEGIN
 SELECT RAISE(ABORT,'google_link_immutable');
END;
CREATE TRIGGER google_identity_immutable BEFORE UPDATE ON google_identity_map BEGIN
 SELECT RAISE(ABORT,'google_identity_immutable');
END;

CREATE TRIGGER google_grant_expiry BEFORE INSERT ON google_link_grants
WHEN NEW.expires_at>unixepoch('now')+300 BEGIN SELECT RAISE(ABORT,'google_grant_expiry'); END;
