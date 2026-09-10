<?php
/* WW_EMAIL_VERIFICATION_CORE_START */
// Embedded unchanged in standalone widgets. Provision the private table once as admin.
if (!function_exists('ww_email_verification_state')) {
    function ww_ev_escape($value) { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
    function ww_ev_db_escape($value) {
        return function_exists('mysql_real_escape_string') ? mysql_real_escape_string((string)$value) : addslashes((string)$value);
    }
    function ww_ev_member_id($value) {
        $text = (string)$value;
        if (!preg_match('/^[1-9][0-9]{0,18}$/D', $text) || (string)intval($text) !== $text) throw new Exception('Please sign in again.');
        return intval($text);
    }
    function ww_ev_query($sql) {
        global $w;
        $result = mysql($w['database'], $sql);
        if ($result === false) throw new Exception('Email verification is temporarily unavailable. Please try again.');
        return $result;
    }
    function ww_ev_user($userId) {
        $id = ww_ev_member_id($userId);
        $result = ww_ev_query("SELECT user_id,email,active FROM users_data WHERE user_id='" . $id . "' LIMIT 1");
        $row = mysql_fetch_assoc($result);
        if (!$row || (string)$row['user_id'] !== (string)$id || (string)$row['active'] !== '2') throw new Exception('Please sign in to an active WeddingWin account.');
        return $row;
    }
    function ww_ev_current_member() {
        global $w;
        if (!class_exists('user') || empty($_COOKIE['userid']) || !user::isUserLogged($_COOKIE)) throw new Exception('Please sign in before changing your email.');
        // BD's cookie is encoded; only getUser resolves the authenticated canonical ID.
        $member = getUser($_COOKIE['userid'], $w);
        if (!is_array($member) || empty($member['user_id'])) throw new Exception('Please sign in again.');
        return ww_ev_user($member['user_id']);
    }
    function ww_ev_lock() {
        // One global lock serializes both member changes and competing target addresses.
        // Older MySQL releases do not safely retain two independent named locks.
        $result = ww_ev_query("SELECT GET_LOCK('ww_email_verification_mutations',5) AS acquired");
        $row = mysql_fetch_assoc($result);
        if (!$row || intval($row['acquired']) !== 1) throw new Exception('Another email request is in progress. Please try again.');
    }
    function ww_ev_unlock() {
        global $w;
        mysql($w['database'], "SELECT RELEASE_LOCK('ww_email_verification_mutations')");
    }
    function ww_ev_is_relay($email) { return preg_match('/@privaterelay\.appleid\.com$/iD', trim((string)$email)) === 1; }
    function ww_ev_utc_time($value) { return is_string($value) && $value !== '' ? strtotime($value . ' UTC') : false; }
    function ww_ev_private_state($userId) {
        $id = ww_ev_member_id($userId);
        $result = ww_ev_query("SELECT * FROM ww_email_verification_state WHERE user_id='" . $id . "' LIMIT 1");
        return mysql_fetch_assoc($result);
    }
    function ww_ev_legacy_meta($userId, $key) {
        $id = ww_ev_member_id($userId);
        $result = ww_ev_query("SELECT `value` FROM users_meta WHERE `database`='users_data' AND database_id='" . $id . "' AND `key`='" . ww_ev_db_escape($key) . "' ORDER BY meta_id DESC LIMIT 1");
        $row = mysql_fetch_assoc($result);
        return $row ? (string)$row['value'] : '';
    }
    function ww_email_verification_state($member) {
        $id = ww_ev_member_id(isset($member['user_id']) ? $member['user_id'] : '');
        $current = strtolower(trim(isset($member['email']) ? (string)$member['email'] : ''));
        if (!filter_var($current, FILTER_VALIDATE_EMAIL)) throw new Exception('Please refresh your account and try again.');
        $row = ww_ev_private_state($id);
        // Old user metadata can only require a new secure link, never establish proof.
        $pending = strtolower(trim($row ? (string)$row['pending_email'] : ww_ev_legacy_meta($id, 'custom_pending_email')));
        $required = ($row ? (string)$row['verification_required'] === '1' : ww_ev_legacy_meta($id, 'custom_email_verification_required') === '1') || $pending !== '';
        $requested = $row ? ww_ev_utc_time($row['requested_at']) : false;
        $status = 'none';
        if ($required) {
            $status = $row && filter_var($pending, FILTER_VALIDATE_EMAIL) && $requested && $requested <= time() + 30 && time() - $requested <= 86400 ? 'pending' : 'expired';
        } elseif ($row && (string)$row['confirmed_email'] === $current && ww_ev_utc_time($row['confirmed_at'])) {
            $status = 'confirmed';
        }
        return array('ok' => true, 'user_id' => (string)$id, 'current_email' => $current,
            'pending_email' => $pending !== '' && filter_var($pending, FILTER_VALIDATE_EMAIL) ? $pending : null,
            'email_confirmation_required' => $required, 'email_verification_status' => $status);
    }
    function ww_ev_random_token() {
        if (function_exists('random_bytes')) return bin2hex(random_bytes(32));
        if (function_exists('openssl_random_pseudo_bytes')) {
            $strong = false;
            $bytes = openssl_random_pseudo_bytes(32, $strong);
            if ($strong && is_string($bytes) && strlen($bytes) === 32) return bin2hex($bytes);
        }
        throw new Exception('Secure email verification is temporarily unavailable.');
    }
    function ww_ev_owner($email) {
        $result = ww_ev_query("SELECT user_id FROM users_data WHERE LOWER(email)='" . ww_ev_db_escape($email) . "' LIMIT 2");
        $first = mysql_fetch_assoc($result);
        if (mysql_fetch_assoc($result)) throw new Exception('That email is already connected to a WeddingWin account.');
        return $first ? (string)$first['user_id'] : '';
    }
    function ww_ev_require_origin() {
        $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
        if ($origin !== 'https://www.weddingwin.ca' && $origin !== 'https://weddingwin.ca') throw new Exception('Please open this form on WeddingWin.ca and try again.');
    }
    function ww_ev_json($body, $status) {
        while (function_exists('ob_get_level') && ob_get_level() > 0) @ob_end_clean();
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        header('Referrer-Policy: no-referrer');
        echo json_encode($body);
        exit();
    }
    function ww_ev_send($member, $newEmail, $verifyPath) {
        $id = ww_ev_member_id($member['user_id']);
        $newEmail = strtolower(trim((string)$newEmail));
        if (strlen($newEmail) > 254 || !filter_var($newEmail, FILTER_VALIDATE_EMAIL)) throw new Exception('Enter a valid email address.');
        if (ww_ev_is_relay($newEmail)) throw new Exception('Use the email address where you would like vendors to contact you, rather than an Apple relay address.');
        if ($verifyPath !== '/verify-email-change' && $verifyPath !== '/verify-email-change-app') throw new Exception('Invalid verification route.');
        ww_ev_lock();
        try {
            $current = ww_ev_user($id);
            $oldEmail = strtolower(trim((string)$current['email']));
            $state = ww_email_verification_state($current);
            if ($oldEmail === $newEmail && !$state['email_confirmation_required']) throw new Exception('That is already your current email address.');
            $owner = ww_ev_owner($newEmail);
            if ($owner !== '' && $owner !== (string)$id) throw new Exception('That email is already connected to another WeddingWin account.');
            $previous = ww_ev_private_state($id);
            $last = $previous ? ww_ev_utc_time($previous['requested_at']) : false;
            if ($last && time() - $last < 60) throw new Exception('Please wait one minute before requesting another email.');
            $token = ww_ev_random_token();
            $hash = hash('sha256', $token);
            $now = gmdate('Y-m-d H:i:s');
            ww_ev_query("INSERT INTO ww_email_verification_state (user_id,verification_required,pending_email,existing_email,token_hash,requested_at,generation) VALUES ('" . $id . "',1,'" . ww_ev_db_escape($newEmail) . "','" . ww_ev_db_escape($oldEmail) . "','" . $hash . "','" . $now . "',1) ON DUPLICATE KEY UPDATE verification_required=1,pending_email=VALUES(pending_email),existing_email=VALUES(existing_email),token_hash=VALUES(token_hash),requested_at=VALUES(requested_at),generation=generation+1");
            $saved = ww_ev_private_state($id);
            if (!$saved || (string)$saved['token_hash'] !== $hash || (string)$saved['pending_email'] !== $newEmail || (string)$saved['verification_required'] !== '1') throw new Exception('Email verification could not be saved. Please try again.');
        } catch (Exception $error) {
            ww_ev_unlock();
            throw $error;
        }
        ww_ev_unlock();
        // No network/mail operations while the database mutation lock is held.
        $url = 'https://www.weddingwin.ca' . $verifyPath . '?token=' . rawurlencode($token);
        $headers = 'From: WeddingWin.ca <noreply@weddingwin.ca>' . PHP_EOL . 'Reply-To: noreply@weddingwin.ca' . PHP_EOL . 'Content-Type: text/plain; charset=UTF-8';
        $body = 'Confirm your WeddingWin contact email by opening this link and choosing Confirm Email:' . PHP_EOL . $url . PHP_EOL . PHP_EOL . 'The link expires in 24 hours. Your current email stays unchanged until you confirm. If you did not request this, ignore this email.';
        if (!@mail($newEmail, 'Confirm your WeddingWin email', $body, $headers)) throw new Exception('Your request was saved, but the email could not be sent. Please try again in a minute.');
        if (filter_var($oldEmail, FILTER_VALIDATE_EMAIL)) @mail($oldEmail, 'WeddingWin email change requested', 'A request was made to change your WeddingWin contact email. It will change only after the new address is confirmed. If this was not you, contact WeddingWin support.', $headers);
        return 'Check your email for the confirmation link. Your current email has not changed.';
    }
    function ww_ev_confirm($token) {
        if (!preg_match('/^[a-f0-9]{64}$/D', (string)$token)) throw new Exception('This confirmation link is invalid or has already been used.');
        $hash = hash('sha256', $token);
        $result = ww_ev_query("SELECT user_id FROM ww_email_verification_state WHERE token_hash='" . $hash . "' LIMIT 2");
        $row = mysql_fetch_assoc($result);
        if (!$row || mysql_fetch_assoc($result)) throw new Exception('This confirmation link is invalid or has already been used. Please request a new email.');
        $id = ww_ev_member_id($row['user_id']);
        ww_ev_lock();
        try {
            $private = ww_ev_private_state($id);
            if (!$private || !function_exists('hash_equals') || !hash_equals((string)$private['token_hash'], $hash)) throw new Exception('This confirmation link is invalid or has already been used.');
            $member = ww_ev_user($id);
            $state = ww_email_verification_state($member);
            $oldEmail = (string)$private['existing_email'];
            if ($state['email_verification_status'] !== 'pending') throw new Exception('This link has expired. Request a new confirmation email.');
            $next = $state['pending_email'];
            if (!$next || ww_ev_is_relay($next)) throw new Exception('Please request confirmation for a direct contact email.');
            if ($oldEmail === '' || ($state['current_email'] !== $oldEmail && $state['current_email'] !== $next)) throw new Exception('Your account email changed after this request. Please request a new confirmation email.');
            $owner = ww_ev_owner($next);
            if ($owner !== '' && $owner !== (string)$id) throw new Exception('That email is already connected to another WeddingWin account.');
            ww_ev_query("UPDATE users_data SET email='" . ww_ev_db_escape($next) . "' WHERE user_id='" . $id . "' AND LOWER(email)='" . ww_ev_db_escape($state['current_email']) . "' LIMIT 1");
            $updated = ww_ev_user($id);
            if (strtolower(trim($updated['email'])) !== $next || ww_ev_owner($next) !== (string)$id) throw new Exception('Your email update could not be confirmed. Please try again.');
            ww_ev_query("UPDATE ww_email_verification_state SET confirmed_email='" . ww_ev_db_escape($next) . "',confirmed_at='" . gmdate('Y-m-d H:i:s') . "',verification_required=0,pending_email=NULL,existing_email=NULL,token_hash=NULL,requested_at=NULL WHERE user_id='" . $id . "' AND token_hash='" . $hash . "' LIMIT 1");
            $confirmed = ww_email_verification_state($updated);
            if ($confirmed['email_verification_status'] !== 'confirmed' || $confirmed['email_confirmation_required']) throw new Exception('Your email confirmation could not be saved. Please try again.');
        } catch (Exception $error) {
            ww_ev_unlock();
            throw $error;
        }
        ww_ev_unlock();
        return $updated;
    }
}
/* WW_EMAIL_VERIFICATION_CORE_END */

$loggedUser = getUser($_COOKIE['userid'], $w);

if ((addonController::isAddonActive('members_only') && (!isset($_COOKIE['userid']) || $loggedUser['active'] != "2") && subscription_types_controller::canMemberViewPage($user['user_id'],$page) === false )){
    addonController::showWidget('members_only','389ffec8e86fc926655fab47a7b01a5a');
} else {
    $MemberSub = getSubscription($user['subscription_id'],$w);
    $userPhoto = getUserPhoto($user['user_id'], $user['listing_type'], $w);
    $userPhoto = $userPhoto['file'];
    // Build Contact Page Schema
    $schema_site_url = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'];
    // Re-encode filename segments (framework auto-decodes, we need to encode it back)
    $filenameParts = explode('/', ltrim($user['filename'], '/'));
    $encodedParts = array_map('rawurlencode', $filenameParts);
    $schema_member_url = $schema_site_url . '/' . implode('/', $encodedParts);
    $schema_contact_url = $schema_member_url . '/connect';
    // Get businessImage (reuse existing $userPhoto)
    $businessImage = $userPhoto;
    if (empty($businessImage) && !empty($w['default_profile_image'])) {
        $businessImage = $w['default_profile_image'];
    }
    if (empty($businessImage) && !empty($w['website_logo'])) {
        $businessImage = $w['website_logo'];
    }
    if (empty($businessImage) && !empty($w['favicon'])) {
        $businessImage = $w['favicon'];
    }
    // Build description
    $pageDesc = "Contact " . $user['full_name'];
    if (!empty($user['city']) && !empty($user['state_ln'])) {
        $pageDesc .= " in " . $user['city'] . ", " . $user['state_ln'];
    }
    $pageDesc .= ". Send a message to connect and get more information.";
    // Build keywords
    $pageKeywords = "Contact " . $user['full_name'] . ", " . $user['full_name'] . " contact";
    if (!empty($user['city'])) {
        $pageKeywords .= ", " . $user['full_name'] . " " . $user['city'];
    }
    // Build WebPage schema (optimized order for AEO/GEO/SEO)
    $webPageSchema = array(
        "@type" => "WebPage",
        "@id" => $schema_contact_url . "#page",
        "url" => $schema_contact_url,
        "name" => "Contact " . $user['full_name'],
        "headline" => "Contact " . $user['full_name'],
        "description" => $pageDesc,
        "inLanguage" => isset($w['website_language']) ? $w['website_language'] : 'en-US',
        "about" => array("@id" => $schema_member_url . "#entity"),
        "mainEntity" => array("@id" => $schema_member_url . "#entity")
    );
    // Add primaryImageOfPage early for entity linking
    if (!empty($businessImage)) {
        $webPageSchema["primaryImageOfPage"] = array("@id" => $schema_member_url . "#profileImage");
    }
    // Add spatialCoverage + contentLocation for GEO/AEO
    if (!empty($user['city']) || !empty($user['state_ln']) || !empty($user['country_code'])) {
        $spatialPlace = array(
            "@type" => "Place"
        );
        if (!empty($user['city']) && $user['city'] !== 'N/A') {
            $spatialPlace["name"] = $user['city'];
        }
        $spatialAddress = array(
            "@type" => "PostalAddress",
            "addressLocality" => !empty($user['city']) ? $user['city'] : 'N/A',
            "addressRegion" => !empty($user['state_code']) ? $user['state_code'] : (!empty($user['state_ln']) ? $user['state_ln'] : 'N/A'),
            "addressCountry" => !empty($user['country_code']) ? $user['country_code'] : 'US'
        );
        $spatialPlace["address"] = $spatialAddress;
        if (!empty($user['lat']) && !empty($user['lon'])) {
            $spatialPlace["geo"] = array(
                "@type" => "GeoCoordinates",
                "latitude" => $user['lat'],
                "longitude" => $user['lon']
            );
        }
        $webPageSchema["spatialCoverage"] = $spatialPlace;
        $webPageSchema["contentLocation"] = $spatialPlace;
    }
    // Add remaining metadata
    $webPageSchema["keywords"] = $pageKeywords;
    $webPageSchema["mainEntityOfPage"] = array("@id" => $schema_contact_url . "#page");
    $webPageSchema["dateModified"] = date('c', strtotime(date('Y-m-01')));
    $webPageSchema["lastReviewed"] = date('c', strtotime(date('Y-m-01')));
    $webPageSchema["copyrightYear"] = date('Y');
    $webPageSchema["copyrightHolder"] = array("@id" => $schema_site_url . "/#organization");
    $webPageSchema["reviewedBy"] = array("@id" => $schema_site_url . "/#organization");
    $webPageSchema["publisher"] = array("@id" => $schema_site_url . "/#organization");
    // Add isPartOf
    $webPageSchema["isPartOf"] = array(
        array("@id" => $schema_site_url . "/#website"),
        array("@id" => $schema_member_url . "#page")
    );
    // Add potentialAction
    $webPageSchema["potentialAction"] = array(
        array(
            "@type" => "ViewAction",
            "target" => $schema_member_url,
            "name" => trim(strip_tags(!empty($Label['view_listing_label']) ? $Label['view_listing_label'] : "View Listing")) . " - " . $user['full_name']
        )
    );
    // Add conditional ReviewAction if reviews enabled
    if (!empty($MemberSub['reviews_enabled']) && $MemberSub['reviews_enabled'] == 1) {
        array_push($webPageSchema["potentialAction"], array(
            "@type" => "ReviewAction",
            "target" => $schema_member_url . "/writeareview",
            "name" => trim(strip_tags(!empty($Label['profile_write_a_review']) ? $Label['profile_write_a_review'] : "Write a Review")) . " - " . $user['full_name']
        ));
    }
    // Build LocalBusiness entity only from complete member data
    $companyName = !empty($user['company']) ? trim(strip_tags($user['company'])) : '';
    $fullName = !empty($user['full_name']) ? trim(strip_tags($user['full_name'])) : '';
    $businessName = $companyName !== '' ? $companyName : $fullName;
    $hasValidGeo = isset($user['lat'], $user['lon']) && is_numeric($user['lat']) && is_numeric($user['lon']) && (float)$user['lat'] >= -90 && (float)$user['lat'] <= 90 && (float)$user['lon'] >= -180 && (float)$user['lon'] <= 180;
    $hasCompleteLocation = !empty($user['city']) && (!empty($user['state_code']) || !empty($user['state_ln'])) && (!empty($user['country_code']) || !empty($user['country_ln']));
    $schemaEligible = isset($user['active']) && (string)$user['active'] === '2' && !empty($MemberSub['searchable']) && (int)$MemberSub['searchable'] === 1 && $businessName !== '' && !empty($user['profession_id']) && (int)$user['profession_id'] > 0 && ($hasCompleteLocation || $hasValidGeo);

    if ($schemaEligible) {
        $businessStub = array(
            "@type" => "LocalBusiness",
            "@id" => $schema_member_url . "#entity",
            "name" => $businessName,
            "url" => $schema_member_url,
            "priceRange" => "$$"
        );

        if (!empty($businessImage)) {
            $businessStub["image"] = array(
                "@type" => "ImageObject",
                "@id" => $schema_member_url . "#profileImage",
                "url" => $businessImage
            );
        }

        $businessPhone = !empty($user['phone']) ? $user['phone'] : (!empty($user['phone_number']) ? $user['phone_number'] : '');
        if ($businessPhone !== '') {
            $businessStub["telephone"] = $businessPhone;
        }

        $businessAddress = array("@type" => "PostalAddress");
        if (!empty($user['address1'])) { $businessAddress["streetAddress"] = $user['address1']; }
        if (!empty($user['city'])) { $businessAddress["addressLocality"] = $user['city']; }
        if (!empty($user['state_code'])) {
            $businessAddress["addressRegion"] = $user['state_code'];
        } elseif (!empty($user['state_ln'])) {
            $businessAddress["addressRegion"] = $user['state_ln'];
        }
        if (!empty($user['zip_code'])) { $businessAddress["postalCode"] = $user['zip_code']; }
        if (!empty($user['country_code'])) {
            $businessAddress["addressCountry"] = $user['country_code'];
        } elseif (!empty($user['country_ln'])) {
            $businessAddress["addressCountry"] = $user['country_ln'];
        }
        if (count($businessAddress) > 1) {
            $businessStub["address"] = $businessAddress;
        }

        if ($hasValidGeo) {
            $businessStub["geo"] = array(
                "@type" => "GeoCoordinates",
                "latitude" => (float)$user['lat'],
                "longitude" => (float)$user['lon']
            );
            $businessStub["location"] = array(
                "@type" => "Place",
                "name" => $businessName,
                "geo" => $businessStub["geo"],
                "hasMap" => "https://www.google.com/maps?q=" . $user['lat'] . "," . $user['lon']
            );
            if (count($businessAddress) > 1) {
                $businessStub["location"]["address"] = $businessAddress;
            }
        }

        $areaServedParts = array();
        if (!empty($user['city'])) { array_push($areaServedParts, $user['city']); }
        if (!empty($user['state_ln'])) { array_push($areaServedParts, $user['state_ln']); }
        if (!empty($user['country_ln'])) { array_push($areaServedParts, $user['country_ln']); }
        if (!empty($areaServedParts)) {
            $businessStub["areaServed"] = implode(', ', $areaServedParts);
        }

        $sameAsLinks = array();
        $sameAsFields = array('website', 'booking_link');
        if (!empty($MemberSub['social_link']) && (int)$MemberSub['social_link'] === 1) {
            $sameAsFields = array_merge($sameAsFields, array('facebook', 'twitter', 'linkedin', 'google_plus', 'youtube', 'instagram', 'pinterest', 'tiktok', 'snapchat', 'whatsapp', 'blog'));
        }
        foreach ($sameAsFields as $field) {
            if (!empty($user[$field])) { array_push($sameAsLinks, $user[$field]); }
        }
        if (!empty($sameAsLinks)) { $businessStub["sameAs"] = $sameAsLinks; }

        // AggregateRating is intentionally omitted because this page does not visibly render the rating and count.
        $schema = array(
            "@context" => "https://schema.org/",
            "@graph" => array($webPageSchema, $businessStub)
        );
        $schema = bdString::jsonHexQuote($schema);
        ?>
        <script type="application/ld+json">
        <?php echo json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_QUOT); ?>
        </script>
        <?php
    }
    if ($MemberSub['receive_messages'] == 1 || $user['active']!="2" || $MemberSub['searchable']!=1) { 
        header("HTTP/1.0 404 Not Found");
    ?>
    
    <div class="col-md-10 col-md-offset-1 member-connect-page-body">
        <div class="alert alert-warning text-center tmargin">
            <h3>%%%profile_inactive%%%</h3>
                <p class="bmargin">%%%profile_inactive_text%%% <a href="%%%default_contact_us_url%%%">%%%contact_us%%%</a> %%%profile_restore_listing%%%.</p>
            <div class="clearfix"></div>
        </div>
    </div>
    <style>.breadcrumb{display:none;}</style> 

    <? } else { 
        $w['show_override'] = 1;

        if ($message != "") { 
            echo showMessage($message,'good',1); 
        } 
        if ($formerror != "") { 
            echo showMessage($formerror,'error',1); 
        } 
        
        if ($pars[$last] == "complete") { ?>
            <div class="col-md-9 col-md-push-3">
                <div class="well">
                    <h3>%%%join_success_message_label%%%</h3>
                    <a class="btn btn-success" href="/<?php echo $user['filename']; ?>" title="Back to Listing">%%%back_to_listing%%%</a>
                </div>
            </div>

        <? } else { ?>
            <div class="col-md-9 col-md-push-3 member-connect-page-body">
                
                <?php
                $addOnDirectMessages = getAddOnInfo("member_direct_messages","13854510c810cf1665cbb29bd14223e2");
                $canReceiveChatMsg = isset($MemberSub['enable_receiving_chat_messages']) ? ($MemberSub['enable_receiving_chat_messages'] == "1") : (isset($MemberSub['enable_direct_messages']) && $MemberSub['enable_direct_messages'] == "1");
                /// Sender permission: the LOGGED-IN viewer must be allowed to send chat on their plan.
                /// The `userid` cookie is encrypted (base64+HMAC), so NEVER compare it to a number —
                /// use !empty() to check presence, then let getUser() decrypt and resolve the user.
                $canSendChatMsg = true;
                $chatViewerUser = array();
                if (!empty($_COOKIE['userid'])) {
                    $chatViewerUser = getUser($_COOKIE['userid'], $w);
                    if (!empty($chatViewerUser['user_id'])) {
                        $chatViewerSub = getSubscription($chatViewerUser['subscription_id'], $w);
                        if (isset($chatViewerSub['enable_sending_chat_messages'])) {
                            $canSendChatMsg = ($chatViewerSub['enable_sending_chat_messages'] == "1");
                        } else if (isset($chatViewerSub['enable_direct_messages'])) {
                            $canSendChatMsg = ($chatViewerSub['enable_direct_messages'] == "1");
                        }
                    }
                }
                $wwChatEmailBlocked = false;
                $wwChatEmailNotice = '';
                if ($canSendChatMsg && !empty($chatViewerUser['user_id'])) {
                    try {
                        $wwChatFreshMember = ww_ev_current_member();
                        $wwChatEmailState = ww_email_verification_state($wwChatFreshMember);
                        $wwChatEmailBlocked = $wwChatEmailState['email_confirmation_required'];
                        if ($wwChatEmailBlocked) {
                            $wwChatEmailNotice = 'Confirm your new email before sending messages. Check your inbox for the confirmation link.';
                        }
                    } catch (Exception $error) {
                        // Only an authenticated member's compose action fails closed.
                        // Public visitors and read-only conversation history are unchanged.
                        $wwChatEmailBlocked = true;
                        $wwChatEmailNotice = 'We could not check your email confirmation. Please refresh and try again shortly.';
                    }
                }
                if (isset($addOnDirectMessages['status']) && $addOnDirectMessages['status'] == "success" && $canReceiveChatMsg && $w['enable_direct_chat_messages'] == "1") {
                    /// Receiver CAN receive — render the chat addon so the viewer can read any
                    /// existing thread. If the viewer's plan does NOT allow sending, inject a
                    /// CSS+JS block that hides the compose textarea + Send Message button and
                    /// shows an upgrade notice. The backend (widget 2322 init-pmb-thread and
                    /// add-thread-message) has the authoritative sender check — this is
                    /// frontend UX so the user never sees a send path they can't use.
                    if (!$canSendChatMsg) {
                        /// Real BD chat compose selectors (found via curl of a live /connect page):
                        ///   .bd-chat-pmb-reply-form-container  — outer wrapper for the compose row
                        ///   .bd-chat-pmb-rfc-fake-cont         — fake container that wraps froala
                        ///   .bd-chat-pmb-rfc-submit-container  — the Send Message button row
                        ///   .chat-froala / #bd-chat-pmbrfc-message — the textarea editor
                        ///   textarea[name="message_content"]   — fallback raw textarea name
                        ///   .bd-chat-pmb-st-form               — the init-pmb-thread form used on first send
                        echo '<style>'
                            . '.bd-chat-pmb-reply-form-container,'
                            . '.bd-chat-pmb-rfc-fake-cont,'
                            . '.bd-chat-pmb-rfc-submit-container,'
                            . '.bd-chat-pmb-st-form,'
                            . '.chat-froala,'
                            . '#bd-chat-pmbrfc-message,'
                            . 'textarea[name="message_content"],'
                            . 'textarea[name="message"],'
                            . 'textarea[name="thread_message"] { display: none !important; }'
                            . '.bd-chat-upgrade-notice { display: block; padding: 14px 18px; background: #fff8c5;'
                            . ' border: 1px solid rgba(212,167,44,.4); border-radius: 6px; margin: 12px 0;'
                            . ' color: #9a6700; text-align: center; font-weight: 500; }'
                            . '</style>';
                        echo '<div class="bd-chat-upgrade-notice">'
                            . (isset($label['chat_message_upgrade_to_send']) && $label['chat_message_upgrade_to_send'] != '' ? $label['chat_message_upgrade_to_send'] : 'Please upgrade to use this feature')
                            . '</div>';
                        /// JS fallback: the chat addon renders its compose UI via JS after page
                        /// load (Froala init), so CSS alone may race. Re-hide on DOMContentLoaded
                        /// + a few timeouts for the Froala init delay.
                        echo "<script>(function(){function hideCompose(){var sels=['.bd-chat-pmb-reply-form-container','.bd-chat-pmb-rfc-fake-cont','.bd-chat-pmb-rfc-submit-container','.bd-chat-pmb-st-form','.chat-froala','#bd-chat-pmbrfc-message','textarea[name=message_content]','textarea[name=message]','textarea[name=thread_message]'];sels.forEach(function(sel){document.querySelectorAll(sel).forEach(function(el){el.style.display='none';});});}document.addEventListener('DOMContentLoaded',hideCompose);setTimeout(hideCompose,500);setTimeout(hideCompose,1500);setTimeout(hideCompose,3000);setTimeout(hideCompose,5000);})();</script>";
                    }
                    if ($wwChatEmailBlocked) {
                        echo '<div id="ww-chat-email-pending-notice" class="ww-chat-email-pending-notice" data-email-confirmation-required="1" role="status" aria-live="polite">'
                            . ww_ev_escape($wwChatEmailNotice)
                            . ' <a href="/verify-email-change">Manage Email Confirmation</a></div>';
                    }
                    echo widget($addOnDirectMessages['widget'],"",$w['website_id'],$w);
                } else if ($user['user_id'] == $_COOKIE['userid'] && $w['disable_self_leads'] == "1") { ?>
                    <div class="well bd-chat-well-container">
                        <h3 class="text-center">%%%member_lead_message_self_warning%%%</h3>
                    </div>
                <? } else if ($w['enable_data_flows'] > 0) { ?>
                    <h1 class="h4 line-height-lg bold alert bg-secondary img-rounded nomargin no-radius-bottom contact-member-title">
                         %%%sidebar_send_message%%%
                    </h1>
                    <div class="well no-radius-top contact-member-form">
                        <?php echo form("bootstrap_get_match","",$w['website_id'],$w); ?>
                    </div>
                <?php } else { ?>
                    <div class="well">
                        
                        <? if ($pars[4] == "request" || $pars[3] == "request") { ?>
                            <h1 class="h2">%%%request_quote_for%%% <?php echo "".$_GET["service"]."";?></h1>
                        
                        <? } else { ?>
                            <h1 class="h2">%%%contact_label%%% <?php echo $user['full_name']; ?></h1>
                        <? }
                        $formname = "listing_send_message";
                        $fd = getForm("",$formname,$w);
                
                        if ($fd['form_name'] == $formname) {
                            $w['form_url'] = "/" . $user['filename'] . "/connect/" . $user['token'] . "/complete";
                            $_GET['usertokenid'] = $user['user_id'];
                            $_ENV['vals1'] = rand(1,4);
                            $_ENV['vals2'] = rand(1,4);
                            $_GET['vals'] = $_ENV['vals1'] . "|" . $_ENV['vals2'];
                            $_GET['answerqmatch'] = $_ENV['vals1'] + $_ENV['vals2'];
                            echo form($formname,"",$w['website_id'],$w);
                        
                        } else { ?>
                            <form action="/<?php echo $user['filename']; ?>/connect/<?php echo $user['token']; ?>/complete" method="post" name=matched onSubmit="return validate();">
                                <input type="hidden" name="vals" VALUE="<?php echo $val1; ?>|<?php echo $val2; ?>">
                                <input type="hidden" name="usertokenid" value="<?php echo $user['user_id']; ?>">
                                <div class="form-group">
                                    <label>%%%name_label%%%</label>
                                    <input required type="text" class="form-control" name="first_name" <? if ($_COOKIE['lead_first_name'] != "") { ?>style="color:#000000;" value="<?php echo $_COOKIE['lead_first_name']; ?>"<? } else { ?>value = ""<? } ?>>
                                </div>
                                <div class="form-group">
                                    <label>%%%email_label%%%</label>
                                    <input required type="email" class="form-control" <? if ($_COOKIE['lead_email'] != "") { ?> value="<?php echo $_COOKIE['lead_email']; ?>"<? } else { ?>value=""<? } ?> id="email" name="email">
                                </div>
                                <div class="form-group">
                                    <label>%%%phone_label%%%</label>
                                    <input  type="text" class="form-control" id="phone" name="phone" <? if ($_COOKIE['lead_phone'] != "") { ?> value="<?php echo $_COOKIE['lead_phone']; ?>"<? } else { ?>value=""<? } ?> >
                                </div>
                                <div class="form-group">
                                    <label>%location_search_default%</label>
                                    <input class="form-control locationSuggest" type="text" name="zip" <? if ($_COOKIE['lead_city'] != "") { ?> value="<?php echo $_COOKIE['lead_city']; ?>"<? } else { ?>value=""<? } ?>  id="zip">
                                </div>
                                <div class="form-group">
                                    <label>%%%enter_message_label%%%</label>
                                    <textarea  name="description" id="description" class="form-control"></textarea> 
                                    <input type="hidden" name="saveinfo" value=1>
                                </div>
                                <div class="form-group">
                                    <label>%%%security_question_label%%%</label>
                                    <div class="input-group">
                                        <span class="input-group-addon">%%%security_question_verification%%% <?php echo $val1; ?> + <?php echo $val2; ?>?</span>
                                        <input class="form-control" required type=text name=answerq>
                                    </div>
                                </div>
                                <input type=submit class="btn btn-block btn-lg btn-primary" value="%%%sidebar_send_message%%% &raquo;"/>
                                <div class="col-md-12 nohpad tpad text-center">
                                    <b>%%%safe_secure_label%%%</b><br>
                                    <small style="font-size:10px;">%%%safe_secure_subtitle%%%</small>
                                </div> 
                                <div class="clearfix"></div>
                            </form> 
                        <? } ?>
                    </div><?/*END <div class="well">*/?>
                <? } ?>

            </div>
    <?  } ?>

    <div class="col-md-3 col-md-pull-9 member-connect-page-sidebar" style="position: sticky;top: 70px;">
        <div class="well">
            <a href="/<?php echo $user['filename']; ?>" title="<?php echo $user['full_name']; ?>">
				<?php list($width, $height, $type, $attr) = getimagesize($_SERVER['DOCUMENT_ROOT'] . $userPhoto);
				if ($attr == "") {
					$attr = 'width="400" height="400"';
				}
				?>
                <img <?php echo $attr; ?> class="img-responsive center-block img-rounded contact-image" src="<?php echo $userPhoto;?>" alt="<?=$w['profession']?>" title="<?=$user['full_name']?> <?=$w['profession']?>">
            </a>
            <a class="btn btn-primary btn-block tmargin" href="/<?php echo $user['filename']; ?>">%%%back_to_listing%%%</a>
        </div>
    </div>

    <? } 
} ?>
