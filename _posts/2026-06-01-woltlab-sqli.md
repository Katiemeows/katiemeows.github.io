---
title: "How I Hacked My First Real World Target! Account Takeover on Forum Software"
---

Recently, I was messing around with stuff, as one does. And what was 
supposed to be a small side-quest with maybe some low impact findings, turned out to be a 
rabbit hole going much deeper than I had initially suspected. While talking to one of my friends, 
he nudged me toward this weird 
[Forum software](https://github.com/WoltLab/WCF), 
I never heard of it before, but I took a look, huh, seems like its not that unpopular after all? 

![List of Customers]({{ '/assets/img/woltlab-customers.png' | relative_url}})
## The Bug

After some messing around and setting up a local test environment, I started playing around with 
the software, trying basic XSS, those kinda things, after exhausting the basic vectors, 
i started reading the code and quite quickly found a interesting looking function in the 
`UserEditor` module, the exact piece of code that gets run when you update your profile. In there
I quickly found this function:

```php
    /**
     * Updates user options.
     *
     * @param array<int, int|float|string> $userOptions
     */
    public function updateUserOptions(array $userOptions = []): void
    {
        $updateSQL = '';
        $statementParameters = [];
        foreach ($userOptions as $optionID => $optionValue) {
            if (!empty($updateSQL)) {
                $updateSQL .= ',';
            }

            $updateSQL .= 'userOption' . $optionID . ' = ?';
            $statementParameters[] = $optionValue;
        }
        $statementParameters[] = $this->userID;

        if (!empty($updateSQL)) {
            $sql = "UPDATE  wcf1_user_option_value
                    SET     " . $updateSQL . "
                    WHERE   userID = ?";
            $statement = WCF::getDB()->prepare($sql);
            $statement->execute($statementParameters);
        }
    }
```
This function is responsible for updating the Values in the DB that belong to our User, 
inside the DB the data is structured as colums of `userOption`'s, so `userOption1` maps to 
your `aboutMe` field while `userOption2` is your `birthday` field, as defined in `UserOption.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<data xmlns="http://www.woltlab.com" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLoca>
        <import>
                <categories>
                        <category name="profile">
                                <showorder>1</showorder>
                        </category>
                        <!-- profile -->
                        <category name="profile.aboutMe">
                                <parent>profile</parent>
                        </category>
                        <category name="profile.personal">
                                <parent>profile</parent>
                        </category>
                        <category name="profile.contact">
                                <parent>profile</parent>
                        </category>
                        ...
```
but there is a bug in the code, did you spot it yet? Well, you probably didn't, after all, 
the PHPDoc says our input is of type `array<int, int|float|string>`, and our Statement params arent 
the Vulnerability, which only leaves the `$optionID` left as controlled input, and that is of
type `int`, so we can't do much here. Or can we?

## AJAX to the Rescue
![If nobody got me, Ajax does]({{ '/assets/img/woltlab-ajax.png' | relative_url }})

While in most modern software, you'd expect a rest api, here we have a ajax proxy, which is 
reachable under `/ajax-proxy.php` and its basically just a dynamic dispatcher for defined Actions:

```php
    protected function invoke()
    {
        ... Bounds checks 
        
        // create object action instance
        $this->objectAction = new $this->className($this->objectIDs, $this->actionName, $this->parameters);

        // validate action
        $this->objectAction->validateAction();

        // execute action
        $this->response = $this->objectAction->executeAction();
    }
```

In our request to the ajax proxy we define which Action of which Class we want to hit, and it 
will validate and later execute it assuming we have the correct priviledges. And to our luck, 
there is a seemingly leftover unused Action in `UserAction.class.php` that trickles straight 
into the vulnerable `updateUserOptions()`:

```php
public function update()
    {
        if (isset($this->parameters['data']) || isset($this->parameters['counters'])) {
            parent::update();

            if (isset($this->parameters['data']['languageID'])) {
                foreach ($this->getObjects() as $object) {
                    if ($object->userID == WCF::getUser()->userID) {
                        if ($this->parameters['data']['languageID'] != WCF::getUser()->languageID) {
                            WCF::setLanguage($this->parameters['data']['languageID']);
                        }

                        break;
                    }
                }
            }

            if (
                isset($this->parameters['data'])
                && \array_key_exists('password', $this->parameters['data'])
                && $this->parameters['data']['password'] !== ''
            ) {
                foreach ($this->getObjects() as $object) {
                    SessionHandler::getInstance()->deleteUserSessionsExcept(
                        $object->getDecoratedObject(),
                        SessionHandler::getInstance()->sessionID
                    );
                }
            }
        } else {
            if (empty($this->objects)) {
                $this->readObjects();
            }
        }

        $groupIDs = $this->parameters['groups'] ?? [];
        $languageIDs = $this->parameters['languageIDs'] ?? [];
        $removeGroups = $this->parameters['removeGroups'] ?? [];
        $userOptions = $this->parameters['options'] ?? [];

        if (!empty($groupIDs)) {
            $action = new self($this->objects, 'addToGroups', [
                'groups' => $groupIDs,
                'addDefaultGroups' => false,
            ]);
            $action->executeAction();
        }

        if (!empty($removeGroups)) {
            $action = new self($this->objects, 'removeFromGroups', [
                'groups' => $removeGroups,
            ]);
            $action->executeAction();
        }

        foreach ($this->getObjects() as $userEditor) {
            if (!empty($userOptions)) {
                $userEditor->updateUserOptions($userOptions);
            }

            if (!empty($languageIDs)) {
                $userEditor->addToLanguages($languageIDs);
            }
        }

        // handle user rename
        if (\count($this->objects) == 1 && !empty($this->parameters['data']['username'])) {
            if ($this->objects[0]->username != $this->parameters['data']['username']) {
                $userID = $this->objects[0]->userID;
                $username = $this->parameters['data']['username'];

                WCF::getDB()->beginTransaction();

                // update article
                $sql = "UPDATE  wcf1_article
                        SET     username = ?
                        WHERE   userID = ?";
                $statement = WCF::getDB()->prepare($sql);
                $statement->execute([$username, $userID]);

                // update comments
                $sql = "UPDATE  wcf1_comment
                        SET     username = ?
                        WHERE   userID = ?";
                $statement = WCF::getDB()->prepare($sql);
                $statement->execute([$username, $userID]);

                // update comment responses
                $sql = "UPDATE  wcf1_comment_response
                        SET     username = ?
                        WHERE   userID = ?";
                $statement = WCF::getDB()->prepare($sql);
                $statement->execute([$username, $userID]);

                // update media
                $sql = "UPDATE  wcf1_media
                        SET     username = ?
                        WHERE   userID = ?";
                $statement = WCF::getDB()->prepare($sql);
                $statement->execute([$username, $userID]);

                // update modification log
                $sql = "UPDATE  wcf1_modification_log
                        SET     username = ?
                        WHERE   userID = ?";
                $statement = WCF::getDB()->prepare($sql);
                $statement->execute([$username, $userID]);

                WCF::getDB()->commitTransaction();

                // fire event to handle other database tables
                EventHandler::getInstance()->fireAction($this, 'rename');
            }
        }
    }	
```

in this rather bulky piece of code, we can see how `$userOptions` is derived from our 
attacker controlled input and then later feeds straight into our vulnerable `updateUserOptions()`, 
which is breaking the initial assumption that `updateUserOptions()` would only be 
called with `array<int, int|float|string>`, we could now provide an `array<string, string>` 
instead and later have our malicious payload:

```sql
parameters[options][1 = ((SELECT DATABASE())), userOption2]=x
```

become interpretted as: 

```sql
UPDATE wcf1_user_option_value
SET userOption1 = ((SELECT DATABASE())), userOption2 = ?
WHERE userID = ?
```

at which point we can exfiltrate database values by directly updating our own userOptions 
(which can be trivially retrieved by viewing your own profile).

## The Endgame

That on its own, is pretty bad! We can exfiltrate all database values we could dream of, 
maybe crack some hashes, steal session tokens, but honestly, thats quite a lot of effort 
when we have a much easier way.

We've all been there, we want to log into our favourite Woltlab Forum, but inconveniently our 
dementia progressed far enough for us to forget our email AND password, luckily to us, we can still 
request a password reset off of our username alone! When we do this, a 20Byte Key gets stored 
in the DB, and we can use our arb DB read to exfiltrate it, afterwards its as simple as restoring 
the valid password reset url, and then we get to set a new password for the victim User. 

If the Forum instance is self hosted, we can now overtake the admin account, 
and install a malicious php extension to get rce on the server its running on.

Thats the endgame. 

![rce1]({{ 'assets/img/woltlab-rce1.png' | relative_url }})
![rce2]({{ 'assets/img/woltlab-rce2.png' | relative_url }})
