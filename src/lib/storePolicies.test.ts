import { describe, expect, it } from 'vitest';
import { policyParagraphs, safePolicyUrl } from './storePolicies';
describe('published policy rendering', () => {
  it('preserves readable paragraphs and decodes entities without executing HTML', () => {
    expect(policyParagraphs('<h2>Privacy</h2><p>Meals &amp; juices.</p><ul><li>Contact us.</li></ul>'))
      .toEqual(['Privacy', 'Meals & juices.', 'Contact us.']);
  });
  it('accepts only this shop’s HTTPS policy links', () => {
    expect(safePolicyUrl('https://checkout.placeinthyme.com/policies/privacy-policy')).toBeTruthy();
    expect(safePolicyUrl('javascript:alert(1)')).toBeNull();
    expect(safePolicyUrl('https://checkout.placeinthyme.com.evil.example/policies/privacy-policy')).toBeNull();
    expect(safePolicyUrl('https://user@checkout.placeinthyme.com/policies/privacy-policy')).toBeNull();
  });
  it('excludes executable content and renders links as text', () => {
    expect(policyParagraphs('<script>secret()</script><style>body{}</style><iframe>hidden</iframe><p onclick="danger()"><a href="javascript:danger()">Policy text</a></p>'))
      .toEqual(['Policy text']);
  });
});
